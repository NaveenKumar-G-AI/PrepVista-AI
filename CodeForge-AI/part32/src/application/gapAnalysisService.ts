import { randomUUID } from "node:crypto";
import { computeRoleGapProfile } from "../domain/gapEngine.js";
import { DEFAULT_GAP_ENGINE_CONFIG, GAP_ALGORITHM_VERSION, type GapEngineConfig } from "../domain/config.js";
import { DEFAULT_EVIDENCE_REQUIREMENTS } from "../domain/config.js";
import type { GapHistoryEntry, RoleGapProfile, SkillGapEngineInput, SkillGapResult } from "../domain/types.js";
import type {
  AIExplanationPort,
  CachePort,
  EvidencePort,
  GapRepositoryPort,
  NextBestActionPort,
  RoleModelPort,
  RoleReadinessPort,
  SkillStatePort,
  TechnicalMasteryReportPort,
} from "../ports/index.js";

export interface GapAnalysisServiceDeps {
  roleModel: RoleModelPort;
  skillState: SkillStatePort;
  evidence: EvidencePort;
  repository: GapRepositoryPort;
  cache: CachePort;
  aiExplanation?: AIExplanationPort;
  nextBestAction?: NextBestActionPort;
  roleReadiness?: RoleReadinessPort;
  technicalMasteryReport?: TechnicalMasteryReportPort;
  config?: GapEngineConfig;
  cacheTtlSeconds?: number;
}

export interface AnalyzeRoleParams {
  organizationId: string;
  studentId: string;
  roleId: string;
  /** Skip the cache read (but still write it) - used by the recalculation
   *  service right after evidence changes. */
  forceRecalculate?: boolean;
}

function cacheKey(organizationId: string, studentId: string, roleId: string): string {
  return `gap-profile:${organizationId}:${studentId}:${roleId}`;
}

/**
 * The single entry point that turns "student + target role" into a full
 * RoleGapProfile, implementing the pipeline from the spec's "Absolute
 * Architectural Rule":
 *
 *   role requirements -> current state -> evidence -> deterministic engine
 *     -> persistence + history -> best-effort AI phrasing
 *     -> best-effort push to Next Best Action / Role Readiness /
 *        Technical Mastery Report (Phase 43-45)
 *
 * AI failure, and downstream-engine failure, are both non-fatal - the
 * deterministic result always ships (Phase 34, 75).
 */
export class GapAnalysisService {
  constructor(private deps: GapAnalysisServiceDeps) {}

  async analyzeRole(params: AnalyzeRoleParams): Promise<RoleGapProfile> {
    const { organizationId, studentId, roleId, forceRecalculate } = params;
    const key = cacheKey(organizationId, studentId, roleId);

    if (!forceRecalculate) {
      const cached = await this.deps.cache.get<RoleGapProfile>(key);
      if (cached) return cached;
    }

    const roleModel = await this.deps.roleModel.getRoleRequirements(roleId, organizationId);
    const skillIds = roleModel.requirements.map((r) => r.skillId);
    const masteryMap = await this.deps.skillState.getCurrentMastery(studentId, skillIds);

    const skillInputs: SkillGapEngineInput[] = await Promise.all(
      roleModel.requirements.map(async (req): Promise<SkillGapEngineInput> => {
        const evidenceRecords = await this.deps.evidence.getEvidence(studentId, req.skillId);
        const previousSnapshot = await this.deps.repository.getSnapshot(organizationId, studentId, roleId, req.skillId);

        return {
          studentId,
          organizationId,
          roleId,
          roleName: roleModel.roleName,
          roleModelVersion: roleModel.roleModelVersion,
          skillId: req.skillId,
          skillName: req.skillName,
          importance: req.importance,
          requiredMastery: req.requiredMastery,
          requiredDifficulty: req.requiredDifficulty,
          evidenceRequirements: req.evidenceRequirements ?? DEFAULT_EVIDENCE_REQUIREMENTS,
          currentMasteryLevel: masteryMap.get(req.skillId) ?? null,
          evidenceRecords,
          previousClosureState: previousSnapshot?.closureState ?? null,
        };
      }),
    );

    const config = this.deps.config ?? DEFAULT_GAP_ENGINE_CONFIG;
    const profile = computeRoleGapProfile(skillInputs, roleModel.dependencyEdges, config);

    // Persist snapshots, recording history only on meaningful transitions,
    // and best-effort attach an AI phrasing of the deterministic result.
    const finalizedSkills: SkillGapResult[] = [];
    for (const skill of profile.skills) {
      const previous = await this.deps.repository.getSnapshot(organizationId, studentId, roleId, skill.skillId);

      if (
        !previous ||
        previous.gapStatus !== skill.gapStatus ||
        previous.closureState !== skill.closureState ||
        previous.severity !== skill.severity
      ) {
        const historyEntry: GapHistoryEntry = {
          id: randomUUID(),
          organizationId,
          studentId,
          roleId,
          skillId: skill.skillId,
          previousGapStatus: previous?.gapStatus ?? null,
          newGapStatus: skill.gapStatus,
          previousClosureState: previous?.closureState ?? null,
          newClosureState: skill.closureState,
          previousSeverity: previous?.severity ?? null,
          newSeverity: skill.severity,
          changeReason: previous ? "Recalculated after evidence/mastery change." : "Initial calculation.",
          gapAlgorithmVersion: GAP_ALGORITHM_VERSION,
          roleModelVersion: roleModel.roleModelVersion,
          occurredAt: new Date().toISOString(),
        };
        await this.deps.repository.recordHistory(historyEntry);
      }

      let aiExplanation: string | null = null;
      if (this.deps.aiExplanation) {
        try {
          aiExplanation = await this.deps.aiExplanation.explain({
            skillName: skill.skillName,
            roleName: roleModel.roleName,
            structuredExplanation: skill.explanation,
            gapStatus: skill.gapStatus,
            severity: skill.severity,
            trend: skill.trend,
          });
        } catch {
          // Non-fatal by design (Phase 34, 75) - the deterministic
          // explanation on `skill.explanation` is always present.
          aiExplanation = null;
        }
      }

      const finalized: SkillGapResult = { ...skill, aiExplanation };
      finalizedSkills.push(finalized);
      await this.deps.repository.saveSnapshot(finalized);
    }

    const finalizedProfile: RoleGapProfile = {
      ...profile,
      skills: finalizedSkills,
      criticalGaps: finalizedSkills.filter((s) => profile.criticalGaps.some((g) => g.skillId === s.skillId)),
      priorityGaps: finalizedSkills.filter((s) => profile.priorityGaps.some((g) => g.skillId === s.skillId)),
      unassessedSkills: finalizedSkills.filter((s) => profile.unassessedSkills.some((g) => g.skillId === s.skillId)),
      rootGaps: finalizedSkills.filter((s) => profile.rootGaps.some((g) => g.skillId === s.skillId)),
    };

    await this.deps.cache.set(key, finalizedProfile, this.deps.cacheTtlSeconds ?? 300);

    // Best-effort pushes to downstream engines (Phase 43-45). Failures here
    // must never fail the gap-analysis response itself.
    const topPriorityGap = finalizedProfile.priorityGaps[0] ?? null;
    void this.deps.nextBestAction
      ?.submitGapContext({ studentId, organizationId, roleId, topPriorityGap })
      .catch(() => undefined);
    void this.deps.roleReadiness
      ?.submitGapContext({ studentId, organizationId, roleId, profile: finalizedProfile })
      .catch(() => undefined);
    void this.deps.technicalMasteryReport
      ?.submitGapContext({ studentId, organizationId, roleId, profile: finalizedProfile })
      .catch(() => undefined);

    return finalizedProfile;
  }

  async invalidate(organizationId: string, studentId: string, roleId: string): Promise<void> {
    await this.deps.cache.invalidate(cacheKey(organizationId, studentId, roleId));
  }
}
