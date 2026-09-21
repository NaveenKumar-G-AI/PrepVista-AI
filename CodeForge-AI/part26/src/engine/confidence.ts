import type { AggregationResult } from '../domain/models.js';
import { SignalPolicy } from '../policy/policy.js';

/**
 * Confidence answers a different question than signal does (req. #21):
 *   signal = 0.82, confidence = 0.31  -> "looks positive, but we barely know yet"
 *   signal = 0.31, confidence = 0.91  -> "we're sure it's weak"
 * Built from: how much evidence (diminishing returns), how diverse, how
 * reliable the sources were, and how much it's currently contradicting itself.
 */
export function computeConfidence(agg: AggregationResult): number {
  if (agg.validEvidenceCount === 0) return 0;

  const { countSaturationK, diversityTargetContexts, contradictionPenaltyMax } = SignalPolicy.confidence;

  const countFactor = 1 - Math.exp(-agg.validEvidenceCount / countSaturationK);
  const diversityFactor = 0.5 + 0.5 * Math.min(1, agg.distinctContexts / diversityTargetContexts);
  const reliabilityFactor = agg.avgSourceReliability;
  const contradictionPenalty = agg.contradictionMagnitude * contradictionPenaltyMax;

  const raw = countFactor * diversityFactor * reliabilityFactor * (1 - contradictionPenalty);
  return Math.max(0, Math.min(1, raw));
}
