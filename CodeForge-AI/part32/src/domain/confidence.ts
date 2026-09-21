import type { ConfidenceFactors, ConsistencyResult } from "./types.js";
import type { GapEngineConfig } from "./config.js";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Implements Phase 24 (Confidence). Confidence is calculated independently
 * from severity - a gap can be HIGH severity and LOW confidence at once,
 * meaning "important potential gap, but more evidence is needed", which is
 * exactly the case the spec calls out.
 *
 * Factors:
 *  - quantity:    evidence count vs. the skill's required minimum
 *  - quality:     average evidence quality tier (0-5 scale)
 *  - diversity:   distinct tasks/contexts vs. required minimum diversity
 *  - recency:     linear decay from the last evidence date
 *  - consistency: penalized when the sample is too small OR inconsistent
 *  - coverage:    whether any evidence reached the role's required difficulty
 */
export function calculateConfidence(params: {
  evidenceCount: number;
  minEvidenceCount: number;
  averageQualityTier: number | null;
  diversityCount: number;
  minDiversity: number;
  daysSinceLastEvidence: number | null;
  recencyWindowDays: number;
  consistency: ConsistencyResult;
  coverageMet: boolean;
  config: GapEngineConfig;
}): { confidence: number; factors: ConfidenceFactors } {
  const {
    evidenceCount,
    minEvidenceCount,
    averageQualityTier,
    diversityCount,
    minDiversity,
    daysSinceLastEvidence,
    recencyWindowDays,
    consistency,
    coverageMet,
    config,
  } = params;

  const quantity = clamp01(evidenceCount / Math.max(1, minEvidenceCount));
  const quality = clamp01((averageQualityTier ?? 0) / 5);
  const diversity = clamp01(diversityCount / Math.max(1, minDiversity));

  const recency =
    daysSinceLastEvidence === null
      ? 0
      : clamp01(1 - daysSinceLastEvidence / Math.max(1, recencyWindowDays * 2));

  const consistencyFactor =
    consistency.status === "INSUFFICIENT_SAMPLE"
      ? 0.5
      : consistency.status === "CONSISTENT"
        ? 1
        : 0.3;

  const coverage = coverageMet ? 1 : 0.4;

  const w = config.confidenceWeights;
  const confidence = clamp01(
    quantity * w.quantity +
      quality * w.quality +
      diversity * w.diversity +
      recency * w.recency +
      consistencyFactor * w.consistency +
      coverage * w.coverage,
  );

  return {
    confidence,
    factors: { quantity, quality, diversity, recency, consistency: consistencyFactor, coverage },
  };
}
