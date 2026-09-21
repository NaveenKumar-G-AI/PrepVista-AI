import type { ConfidenceBucket, RoleModel, SkillRequirement, SkillSignal } from './types';
import {
  CONFIDENCE_BUCKET_THRESHOLDS,
  CONFIDENCE_QUANTITY_MULTIPLIER,
  CONFIDENCE_WEIGHTS,
  IMPORTANCE_WEIGHT,
  OVERALL_CONFIDENCE_SPLIT,
} from './config';

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Confidence is calculated independently from mastery/readiness (Phase 17).
 * A skill can be "strong" with low confidence (thin evidence) just as
 * easily as "competent" with high confidence (extensive verified evidence).
 */
export function computeSkillConfidence(signal: SkillSignal, requirement: SkillRequirement): number {
  if (signal.status === 'unassessed') return 0.05;

  const quantity = clamp(
    signal.qualifyingEvidenceCount / (requirement.evidenceRequirement.minEvidenceCount * CONFIDENCE_QUANTITY_MULTIPLIER),
  );
  // Proxy for evidence quality: how much of the evidence for this skill was
  // strong enough to qualify at all (see Phase 6 hierarchy).
  const quality = clamp(signal.qualifyingEvidenceCount / Math.max(1, signal.evidenceCount));
  // Phase 18 — diversity across task types and difficulty levels, not just count.
  const diversity = clamp(((signal.distinctTaskTypes - 1) / 2) * 0.5 + ((signal.distinctDifficulties - 1) / 2) * 0.5);
  const recency = clamp(signal.recencyScore);
  const consistency = signal.consistency === 'stable' ? 1 : signal.consistency === 'insufficient_sample' ? 0.55 : 0.35;

  let score =
    CONFIDENCE_WEIGHTS.quantity * quantity +
    CONFIDENCE_WEIGHTS.quality * quality +
    CONFIDENCE_WEIGHTS.diversity * diversity +
    CONFIDENCE_WEIGHTS.recency * recency +
    CONFIDENCE_WEIGHTS.consistency * consistency;

  if (signal.status === 'insufficient_evidence') score = Math.min(score, 0.35);

  return clamp(score);
}

export function bucketConfidence(score: number): ConfidenceBucket {
  if (score < CONFIDENCE_BUCKET_THRESHOLDS.low) return 'low';
  if (score < CONFIDENCE_BUCKET_THRESHOLDS.medium) return 'medium';
  return 'high';
}

/** Importance-weighted fraction of role skills with status 'assessed' (Phase 21 "coverage"). */
export function computeCoverage(roleModel: RoleModel, signals: Map<string, SkillSignal>): number {
  let num = 0;
  let den = 0;
  for (const req of roleModel.skills) {
    const w = req.weight ?? IMPORTANCE_WEIGHT[req.importance];
    den += w;
    const signal = signals.get(req.skillId);
    if (signal && signal.status === 'assessed') num += w;
  }
  return den > 0 ? num / den : 0;
}

export function computeOverallConfidence(
  roleModel: RoleModel,
  signals: Map<string, SkillSignal>,
  perSkillConfidence: Map<string, number>,
): number {
  const coverage = computeCoverage(roleModel, signals);

  let confNum = 0;
  let confDen = 0;
  for (const req of roleModel.skills) {
    const w = req.weight ?? IMPORTANCE_WEIGHT[req.importance];
    confNum += w * (perSkillConfidence.get(req.skillId) ?? 0);
    confDen += w;
  }
  const avgSkillConfidence = confDen > 0 ? confNum / confDen : 0;

  return clamp(OVERALL_CONFIDENCE_SPLIT.coverage * coverage + OVERALL_CONFIDENCE_SPLIT.skillAverage * avgSkillConfidence);
}
