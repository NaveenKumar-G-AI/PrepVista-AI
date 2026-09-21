/**
 * All growth-rule thresholds live here, and only here. The engine modules
 * import from this file instead of hardcoding numbers, and every threshold
 * is stamped with a `rulesVersion` so historical snapshots stay
 * attributable to the rules that produced them (see README §Versioning).
 *
 * Changing a number here is a rules change — bump RULES_VERSION.
 */

export const RULES_VERSION = "growth-rules@1.0.0";
export const GROWTH_ENGINE_VERSION = "growth-engine@1.0.0";

export const GrowthConfig = {
  rulesVersion: RULES_VERSION,

  evidence: {
    /** Below this many evidence points for a dimension, no state beyond
     * NO_EVIDENCE / INSUFFICIENT_EVIDENCE / EMERGING may be asserted. */
    minCountForAnyConclusion: 2,
    /** Below this, a dimension is NO_EVIDENCE rather than
     * INSUFFICIENT_EVIDENCE (i.e. genuinely nothing vs. "a little, not
     * enough"). */
    minCountForInsufficientVsNone: 1,
    /** A single success is never enough for IMPROVING/STRONG/MASTERED —
     * it can at most establish EMERGING. */
    minCountForImprovingClaim: 3,
    /** A single failure is never enough for REGRESSING — it can at most
     * flag AT_RISK, pending more evidence. */
    minCountForRegressingClaim: 3,
    /** Evidence older than this many days is excluded from "recent"
     * windows used for improvement/regression comparison. */
    recentWindowDays: 30,
    /** Baseline window must span at least this many days away from the
     * recent window so the two are actually comparable states, not the
     * same handful of submissions counted twice. */
    minBaselineSeparationDays: 14,
  },

  diversity: {
    /** Evidence spread across at least this many distinct challenge
     * families counts as "diverse" for confidence purposes. */
    minFamiliesForDiverse: 3,
    /** Weight applied to duplicate-family evidence beyond the first
     * occurrence in a family, so 5 near-identical problems can't imitate
     * 5 independent demonstrations. */
    sameFamilyDiminishingWeight: 0.4,
  },

  significance: {
    /** Minimum absolute shift in success-rate (0-1 scale) between
     * baseline and recent windows to call it IMPROVING/REGRESSING rather
     * than STABLE noise. */
    minSuccessRateDelta: 0.25,
    /** Isolated single-point swings smaller than this are always treated
     * as noise regardless of direction. */
    noiseFloor: 0.1,
  },

  stagnation: {
    /** "High activity" floor (evidence count in the recent window) that
     * makes flat evidence worth calling out as stagnation instead of
     * just STABLE. */
    minRecentActivityForStagnation: 5,
    /** Success-rate delta below this, with activity above the floor
     * above, reads as stagnation rather than improvement. */
    maxDeltaConsideredFlat: 0.08,
  },

  retention: {
    /** Minimum gap since a dimension's prior evidence for a later
     * success to count as a genuine retention demonstration rather than
     * routine practice. */
    minGapDaysForRetentionCredit: 21,
  },

  independence: {
    /** Assistance levels mapped to a 0 (none) .. 1 (solution exposed)
     * scale for trend calculation. */
    assistanceScale: {
      NONE: 0,
      LOW: 0.25,
      MODERATE: 0.5,
      HIGH: 0.75,
      SOLUTION_EXPOSED: 1,
    } as const,
    /** Minimum drop in mean assistance score (recent vs baseline) with
     * stable-or-better performance to call independence "IMPROVING". */
    minAssistanceDropForImprovement: 0.2,
  },

  confidence: {
    /** Score thresholds mapping the internal 0-1 confidence score to the
     * four public confidence levels. */
    thresholds: {
      high: 0.75,
      medium: 0.45,
      low: 0.2,
      // below `low` => INSUFFICIENT
    },
    weights: {
      evidenceCount: 0.3,
      diversity: 0.25,
      recency: 0.15,
      consistency: 0.2,
      transferBonus: 0.1,
    },
    /** Evidence count considered "saturating" for the count factor — more
     * than this doesn't add further confidence, avoiding false precision
     * from activity volume alone. */
    saturatingEvidenceCount: 10,
  },

  mastery: {
    /** STRONG requires this many diverse, consistent successes. */
    minEvidenceForStrong: 6,
    /** MASTERED additionally requires at least one retention AND one
     * transfer confirmation, sustained over this many days. */
    minSpanDaysForMastered: 45,
  },

  velocity: {
    /** Evidence-per-day thresholds bucketing velocity into SLOW / MODERATE
     * / FAST, deliberately coarse — see README §GrowthVelocity for why we
     * never show a raw percentage. */
    slowMax: 0.05,
    moderateMax: 0.15,
  },

  activityLevel: {
    lowMax: 2,
    moderateMax: 8,
    // above moderateMax => HIGH
  },
} as const;

export type GrowthConfigT = typeof GrowthConfig;
