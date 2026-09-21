import type {
  DefiniteMasteryLevel,
  EvidenceRecord,
  ReadinessResult,
  RoleModel,
  SkillReadinessResult,
  SkillSignal,
} from './types';
import { aggregateSkillEvidence } from './evidenceAggregation';
import { evaluateCoreGates } from './coreGates';
import { bucketConfidence, computeCoverage, computeOverallConfidence, computeSkillConfidence } from './confidence';
import { classifyReadiness } from './classification';
import { deriveBlockers, deriveStrengths } from './blockersAndStrengths';
import { ALGORITHM_VERSION, IMPORTANCE_WEIGHT, MASTERY_ANCHOR_SCORE, MASTERY_ORDER, RATIO_CAP_PER_SKILL } from './config';

function rank(level: SkillSignal['mastery']): number {
  return MASTERY_ORDER.indexOf(level);
}

export interface ComputeReadinessInput {
  studentId: string;
  organizationId: string;
  roleModel: RoleModel;
  /** All verified evidence available for this student across skills relevant to the role. */
  evidence: EvidenceRecord[];
  now?: Date;
  /** Phase 49 — skill ids whose evidence source failed to load this run. */
  unavailableSkillIds?: Set<string>;
}

function anchorScore(level: DefiniteMasteryLevel): number {
  return MASTERY_ANCHOR_SCORE[level];
}

/**
 * THE authoritative readiness calculation (Phase 14, "non-negotiable
 * architectural rule"). Pure, deterministic, synchronous: same inputs
 * always produce the same output. No network calls, no AI, no randomness.
 * Everything downstream (API layer, AI explanation, UI) treats this
 * function's output as ground truth and never recomputes or overrides it.
 */
export function computeRoleReadiness(input: ComputeReadinessInput): ReadinessResult {
  const now = input.now ?? new Date();
  const warnings: string[] = [];
  const signals = new Map<string, SkillSignal>();

  for (const req of input.roleModel.skills) {
    const unavailable = input.unavailableSkillIds?.has(req.skillId) ?? false;
    if (unavailable) {
      warnings.push(`Evidence source unavailable for "${req.skillName}" this run — treated as unassessed, not failing.`);
    }
    const signal = aggregateSkillEvidence(req.skillId, input.evidence, req.evidenceRequirement, {
      now,
      dataAvailability: unavailable ? 'source_unavailable' : 'ok',
    });
    signals.set(req.skillId, signal);
  }

  const coreGateResult = evaluateCoreGates(input.roleModel, signals);
  const coverage = computeCoverage(input.roleModel, signals);

  const perSkillConfidence = new Map<string, number>();
  for (const req of input.roleModel.skills) {
    perSkillConfidence.set(req.skillId, computeSkillConfidence(signals.get(req.skillId)!, req));
  }
  const overallConfidenceScore = computeOverallConfidence(input.roleModel, signals, perSkillConfidence);
  const confidence = bucketConfidence(overallConfidenceScore);

  // Weighted readiness score. Unassessed/insufficient skills contribute 0 to
  // the numerator (a required skill with no verified evidence IS a genuine
  // gap for readiness purposes) but are never mislabeled as "weak" anywhere
  // else — status, blockers, and skillBreakdown all say "unassessed" /
  // "insufficient_evidence" explicitly. See README "Design decisions".
  let num = 0;
  let den = 0;
  for (const req of input.roleModel.skills) {
    const w = req.weight ?? IMPORTANCE_WEIGHT[req.importance];
    den += w;
    const signal = signals.get(req.skillId)!;
    if (signal.status !== 'assessed' || signal.masteryScoreEstimate === null) continue;
    const required = anchorScore(req.minimumMastery);
    const ratio = Math.min(RATIO_CAP_PER_SKILL, signal.masteryScoreEstimate / required);
    num += w * ratio;
  }
  const weightedScore = den > 0 ? Math.max(0, Math.min(100, Math.round((num / den) * 100))) : 0;

  const readinessState = classifyReadiness({
    coreGatePassed: coreGateResult.passed,
    weightedScore,
    coverage,
    confidence,
  });

  const blockers = deriveBlockers(input.roleModel, signals);
  const strengths = deriveStrengths(input.roleModel, signals);

  const skillBreakdown: SkillReadinessResult[] = input.roleModel.skills.map((req) => {
    const signal = signals.get(req.skillId)!;
    const meetsThreshold =
      signal.status === 'assessed' && rank(signal.mastery) >= rank(req.minimumMastery);
    const blocker = blockers.find((b) => b.skillId === req.skillId)?.type ?? null;
    return {
      skillId: req.skillId,
      skillName: req.skillName,
      importance: req.importance,
      required: req.minimumMastery,
      currentMastery: signal.mastery,
      status: signal.status,
      confidence: bucketConfidence(perSkillConfidence.get(req.skillId) ?? 0),
      confidenceScore: perSkillConfidence.get(req.skillId) ?? 0,
      evidenceCount: signal.evidenceCount,
      recentTrend: signal.trend,
      meetsThreshold,
      blocker,
    };
  });

  const evidenceTrace = input.roleModel.skills.map((req) => ({
    skillId: req.skillId,
    evidenceIds: signals.get(req.skillId)!.contributingEvidenceIds,
  }));

  return {
    studentId: input.studentId,
    organizationId: input.organizationId,
    roleId: input.roleModel.roleId,
    roleName: input.roleModel.roleName,
    roleModelVersion: input.roleModel.version,
    algorithmVersion: ALGORITHM_VERSION,
    readinessState,
    readinessScore: weightedScore,
    confidence,
    confidenceScore: overallConfidenceScore,
    coverage,
    coreGatePassed: coreGateResult.passed,
    strengths,
    blockers,
    skillBreakdown,
    warnings,
    evidenceTrace,
    calculatedAt: now.toISOString(),
  };
}
