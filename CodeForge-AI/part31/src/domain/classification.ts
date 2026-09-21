import type { ConfidenceBucket, ReadinessState } from './types';
import { CLASSIFICATION_THRESHOLDS, CONFIDENCE_RANK } from './config';

export interface ClassifyReadinessInput {
  coreGatePassed: boolean;
  /** 0-100 */
  weightedScore: number;
  /** 0-1 */
  coverage: number;
  confidence: ConfidenceBucket;
}

/**
 * Phase 12 in code: if any core skill fails its gate, the state is capped at
 * DEVELOPING (or lower) regardless of how high the weighted average is —
 * averages cannot hide a failing core skill. This is the single function
 * where that rule is enforced; nowhere else computes a readiness state.
 */
export function classifyReadiness(input: ClassifyReadinessInput): ReadinessState {
  const { coreGatePassed, weightedScore, coverage, confidence } = input;
  const t = CLASSIFICATION_THRESHOLDS;

  if (!coreGatePassed) {
    if (coverage < t.notAssessedCoverageBelow) return 'NOT_ASSESSED';
    if (weightedScore < t.developingScoreAtLeast) return 'EARLY_STAGE';
    return 'DEVELOPING';
  }

  // Defensive guard for a role model with no core skills at all — coverage
  // can otherwise be near-zero even though the (vacuous) gate "passed".
  if (coverage < t.notAssessedCoverageBelow) return 'NOT_ASSESSED';

  if (weightedScore >= t.stronglyReadyScoreAtLeast && CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK[t.stronglyReadyMinConfidence]) {
    return 'STRONGLY_READY';
  }
  if (weightedScore >= t.readyScoreAtLeast && CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK[t.readyMinConfidence]) {
    return 'READY';
  }
  if (weightedScore >= t.approachingReadyScoreAtLeast) return 'APPROACHING_READY';
  if (weightedScore >= t.developingScoreAtLeast) return 'DEVELOPING';
  return 'EARLY_STAGE';
}
