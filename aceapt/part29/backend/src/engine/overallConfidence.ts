import { ConfidenceBand, ImportanceTier } from '../domain/types';
import { RequirementEvaluation } from './requirementEvaluator';

const IMPORTANCE_WEIGHT: Record<ImportanceTier, number> = {
  CORE: 1.0,
  IMPORTANT: 0.6,
  SUPPORTING: 0.3,
};

const BAND_THRESHOLDS = { low: 0.35, high: 0.7 };

export interface OverallConfidence {
  band: ConfidenceBand;
  score: number;
}

/**
 * Importance-weighted average of per-requirement confidence, over
 * requirements that actually have evidence. A requirement with zero
 * evidence contributes no confidence signal here — it's tracked separately
 * as an insufficient-evidence capability (gapClassifier.ts) rather than
 * silently dragging this average toward LOW.
 */
export function aggregateConfidence(evaluations: RequirementEvaluation[]): OverallConfidence {
  const withEvidence = evaluations.filter((r) => r.hasEvidence);
  if (withEvidence.length === 0) {
    return { band: 'LOW', score: 0 };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  for (const r of withEvidence) {
    const w = IMPORTANCE_WEIGHT[r.importance];
    weightedSum += r.confidenceScore * w;
    weightTotal += w;
  }

  const score = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const band: ConfidenceBand =
    score < BAND_THRESHOLDS.low ? 'LOW' : score < BAND_THRESHOLDS.high ? 'MEDIUM' : 'HIGH';

  return { band, score };
}
