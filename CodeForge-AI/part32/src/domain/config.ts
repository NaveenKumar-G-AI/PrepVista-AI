/**
 * All tunable constants for the gap engine live here, in one place, with
 * documented meaning. Nothing in domain/*.ts hardcodes a magic number that
 * isn't defined and explained in this file (Phase 9: "must be deterministic
 * and documented"; Phase 18: decay/thresholds "must be configurable,
 * documented, versioned, tested").
 *
 * Bump GAP_ALGORITHM_VERSION whenever a change here (or in domain/*.ts)
 * would change historical results. Persisted snapshots always carry the
 * version they were computed with (Phase 54), so changing these numbers
 * never makes past results uninterpretable.
 */

export const GAP_ALGORITHM_VERSION = "1.0.0";

export const DEFAULT_EVIDENCE_REQUIREMENTS = {
  minEvidenceCount: 3,
  minDiversity: 2,
  recencyWindowDays: 120,
};

export interface GapEngineConfig {
  /** Ordinal distance (target - current) at or below which a gap is
   *  classified PARTIAL rather than BELOW_TARGET. */
  partialGapThreshold: number;

  /** Below this many evidence records, the engine will not attempt a
   *  confident BELOW_TARGET/NO_GAP/PARTIAL call - it reports
   *  INSUFFICIENT_EVIDENCE instead (Phase 25). This is intentionally a
   *  lower bar than a skill's full `evidenceRequirements`, which gate
   *  CLOSURE (Phase 28), not classification. */
  minEvidenceForConfidentClassification: number;

  /** Minimum number of scored evidence points before consistency/trend are
   *  evaluated at all. Below this, status is INSUFFICIENT_SAMPLE / UNKNOWN
   *  rather than a false "consistent" or "stable" (Phase 19: "Do not claim
   *  inconsistency from an inadequate sample"). */
  minSampleForConsistencyCheck: number;

  /** Standard deviation (0-100 score scale) above which repeated evidence
   *  is considered INCONSISTENT. */
  consistencyStdDevThreshold: number;

  /** Standard deviation above which a trend is VOLATILE rather than a
   *  directional IMPROVING/WORSENING/STABLE read. */
  volatilityStdDevThreshold: number;

  /** Minimum swing (second-half average minus first-half average, on the
   *  0-100 score scale) to call a trend IMPROVING or WORSENING. */
  trendImprovingThreshold: number;
  trendWorseningThreshold: number;

  /** Gap magnitude at or below which an open gap is considered
   *  NEARLY_CLOSED rather than OPEN/IN_PROGRESS. */
  nearlyClosedMagnitudeThreshold: number;

  /** Weights (should sum to 1) for the confidence composite. */
  confidenceWeights: {
    quantity: number;
    quality: number;
    diversity: number;
    recency: number;
    consistency: number;
    coverage: number;
  };

  /** Weights (should sum to 1) for the priority composite. */
  priorityWeights: {
    severity: number;
    importance: number;
    magnitude: number;
    dependency: number;
    confidence: number;
  };
}

export const DEFAULT_GAP_ENGINE_CONFIG: GapEngineConfig = {
  partialGapThreshold: 1,
  minEvidenceForConfidentClassification: 2,
  minSampleForConsistencyCheck: 3,
  consistencyStdDevThreshold: 15,
  volatilityStdDevThreshold: 25,
  trendImprovingThreshold: 8,
  trendWorseningThreshold: 8,
  nearlyClosedMagnitudeThreshold: 1,
  confidenceWeights: {
    quantity: 0.2,
    quality: 0.2,
    diversity: 0.15,
    recency: 0.15,
    consistency: 0.2,
    coverage: 0.1,
  },
  priorityWeights: {
    severity: 0.4,
    importance: 0.25,
    magnitude: 0.15,
    dependency: 0.15,
    confidence: 0.05,
  },
};
