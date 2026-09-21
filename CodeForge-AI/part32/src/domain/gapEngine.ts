import {
  ClosureState,
  GapStatus,
  RoleSkillImportance,
  Severity,
  type DependencyAnnotation,
  type DependencyEdge,
  type RoleGapProfile,
  type SkillGapEngineInput,
  type SkillGapResult,
} from "./types.js";
import { masteryLabel } from "./types.js";
import { DEFAULT_GAP_ENGINE_CONFIG, GAP_ALGORITHM_VERSION, type GapEngineConfig } from "./config.js";
import { aggregateEvidence } from "./evidence.js";
import { detectConsistency, detectTrend, selectRecentScores } from "./statistics.js";
import { calculateGapMagnitude, classifyGap } from "./classification.js";
import { calculateConfidence } from "./confidence.js";
import { calculateSeverity } from "./severity.js";
import { calculatePriorityScore, rankGapsForRole } from "./priority.js";
import { analyzeDependencies } from "./dependencyGraph.js";
import { nextClosureState } from "./closureStateMachine.js";
import { buildStructuredExplanation } from "./explanation.js";

const EMPTY_DEPENDENCY: DependencyAnnotation = {
  isRootGap: false,
  blockedBy: [],
  blocks: [],
  dependencyImpactScore: 0,
};

/**
 * Computes the full gap result for ONE skill. This is the "Absolute
 * Architectural Rule" pipeline from the spec, made concrete:
 *
 *   requirement + evidence + dependency annotation
 *     -> classification -> magnitude -> confidence -> severity
 *     -> priority -> closure -> structured explanation
 *
 * Pure function: same input always produces the same output. The AI
 * explanation layer is deliberately NOT called from here - see
 * application/gapAnalysisService.ts, which calls this function first and
 * only afterwards, best-effort, asks AI to phrase (never decide) the
 * result (Phase 33-34).
 */
export function computeSkillGap(
  input: SkillGapEngineInput,
  config: GapEngineConfig = DEFAULT_GAP_ENGINE_CONFIG,
  dependency: DependencyAnnotation = EMPTY_DEPENDENCY,
): SkillGapResult {
  const agg = aggregateEvidence(input.evidenceRecords);
  const consistency = detectConsistency(selectRecentScores(agg.scoreSeries, config), config);
  const trend = detectTrend(agg.scoreSeries, consistency, config);

  const gapStatus = classifyGap({
    current: input.currentMasteryLevel,
    target: input.requiredMastery,
    evidenceCount: agg.evidenceCount,
    consistency,
    blockedByPrerequisite: dependency.blockedBy.length > 0,
    config,
  });

  const gapMagnitude = calculateGapMagnitude(input.currentMasteryLevel, input.requiredMastery);

  const evidenceConditionsMet =
    agg.evidenceCount >= input.evidenceRequirements.minEvidenceCount &&
    agg.diversityCount >= input.evidenceRequirements.minDiversity &&
    agg.daysSinceLastEvidence !== null &&
    agg.daysSinceLastEvidence <= input.evidenceRequirements.recencyWindowDays;

  const coverageMet =
    input.requiredDifficulty === undefined ||
    (agg.maxDifficultyObserved !== null && agg.maxDifficultyObserved >= input.requiredDifficulty);

  const { confidence, factors } = calculateConfidence({
    evidenceCount: agg.evidenceCount,
    minEvidenceCount: input.evidenceRequirements.minEvidenceCount,
    averageQualityTier: agg.averageQualityTier,
    diversityCount: agg.diversityCount,
    minDiversity: input.evidenceRequirements.minDiversity,
    daysSinceLastEvidence: agg.daysSinceLastEvidence,
    recencyWindowDays: input.evidenceRequirements.recencyWindowDays,
    consistency,
    coverageMet,
    config,
  });

  const severity = calculateSeverity({
    gapStatus,
    gapMagnitude,
    importance: input.importance,
    isRootGap: dependency.isRootGap,
    dependencyImpactScore: dependency.dependencyImpactScore,
    config,
  });

  const priorityScore = calculatePriorityScore({
    severity,
    importance: input.importance,
    gapMagnitude,
    dependencyImpactScore: dependency.dependencyImpactScore,
    confidence,
    config,
  });

  const meetsTarget = gapMagnitude === 0 && input.currentMasteryLevel !== null;

  const { state: closureState, reason: closureReason } = nextClosureState({
    previousState: input.previousClosureState,
    gapStatus,
    meetsTarget,
    evidenceConditionsMet,
    gapMagnitude,
    config,
  });

  const explanation = buildStructuredExplanation({
    skillName: input.skillName,
    roleName: input.roleName,
    gapStatus,
    currentLabel: masteryLabel(input.currentMasteryLevel),
    targetLabel: masteryLabel(input.requiredMastery),
    trend,
    evidenceCount: agg.evidenceCount,
  });

  return {
    studentId: input.studentId,
    organizationId: input.organizationId,
    roleId: input.roleId,
    roleModelVersion: input.roleModelVersion,
    gapAlgorithmVersion: GAP_ALGORITHM_VERSION,
    skillId: input.skillId,
    skillName: input.skillName,
    importance: input.importance,
    currentState: { masteryLevel: input.currentMasteryLevel, label: masteryLabel(input.currentMasteryLevel) },
    targetState: { masteryLevel: input.requiredMastery, label: masteryLabel(input.requiredMastery) },
    gapStatus,
    gapMagnitude,
    severity,
    priorityScore,
    priorityRank: null,
    confidence,
    confidenceFactors: factors,
    trend,
    consistency,
    closureState,
    closureReason,
    evidenceSummary: {
      totalCount: agg.evidenceCount,
      usedEvidenceIds: input.evidenceRecords.map((r) => r.id),
      latestAt: agg.latestAt,
      oldestAt: agg.oldestAt,
      diversity: agg.diversityCount,
      averageQualityTier: agg.averageQualityTier,
    },
    dependency,
    explanation,
    aiExplanation: null,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Computes the full role-level gap profile for a student. Three-pass
 * structure, and the ordering is load-bearing:
 *
 *   Pass 1: classify every skill WITHOUT dependency information, to answer
 *           "does skill X currently have a gap at all" without circularity.
 *   Pass 2: run dependency/root-gap analysis using the Pass 1 map.
 *   Pass 3: recompute each skill for real, now dependency-aware, which is
 *           what can turn a BELOW_TARGET skill into DEPENDENCY_BLOCKED and
 *           feeds isRootGap/dependencyImpactScore into severity & priority.
 *
 * Then priority ranking and the role-level rollups (Phase 35-40's data
 * needs) are derived from the final, dependency-aware results.
 */
export function computeRoleGapProfile(
  inputs: SkillGapEngineInput[],
  dependencyEdges: DependencyEdge[],
  config: GapEngineConfig = DEFAULT_GAP_ENGINE_CONFIG,
): RoleGapProfile {
  const gapStatusBySkill = new Map<string, GapStatus>();
  const importanceBySkill = new Map<string, RoleSkillImportance>();

  for (const input of inputs) {
    const agg = aggregateEvidence(input.evidenceRecords);
    const consistency = detectConsistency(selectRecentScores(agg.scoreSeries, config), config);
    const prelimStatus = classifyGap({
      current: input.currentMasteryLevel,
      target: input.requiredMastery,
      evidenceCount: agg.evidenceCount,
      consistency,
      blockedByPrerequisite: false,
      config,
    });
    gapStatusBySkill.set(input.skillId, prelimStatus);
    importanceBySkill.set(input.skillId, input.importance);
  }

  const dependencyBySkill = new Map<string, DependencyAnnotation>();
  for (const input of inputs) {
    dependencyBySkill.set(
      input.skillId,
      analyzeDependencies({ skillId: input.skillId, dependencyEdges, gapStatusBySkill, importanceBySkill }),
    );
  }

  const results = inputs.map((input) =>
    computeSkillGap(input, config, dependencyBySkill.get(input.skillId) ?? EMPTY_DEPENDENCY),
  );

  const ranked = rankGapsForRole(results);

  const criticalGaps = ranked.filter((r) => r.severity === Severity.CRITICAL && r.gapStatus !== GapStatus.NO_GAP);
  const priorityGaps = ranked.filter((r) => r.gapStatus !== GapStatus.NO_GAP).slice(0, 10);
  const unassessedSkills = ranked.filter((r) => r.gapStatus === GapStatus.UNASSESSED);
  const rootGaps = ranked.filter((r) => r.dependency.isRootGap);

  const coreSkills = ranked.filter((r) => r.importance === RoleSkillImportance.CORE);
  const coreSkillCoverage = {
    total: coreSkills.length,
    meetingTarget: coreSkills.filter((r) => r.gapStatus === GapStatus.NO_GAP).length,
  };

  const first = inputs[0];

  return {
    studentId: first?.studentId ?? "",
    organizationId: first?.organizationId ?? "",
    roleId: first?.roleId ?? "",
    roleName: first?.roleName ?? "",
    roleModelVersion: first?.roleModelVersion ?? "",
    gapAlgorithmVersion: GAP_ALGORITHM_VERSION,
    skills: ranked,
    criticalGaps,
    priorityGaps,
    unassessedSkills,
    rootGaps,
    coreSkillCoverage,
    calculatedAt: new Date().toISOString(),
  };
}

export { ClosureState };
