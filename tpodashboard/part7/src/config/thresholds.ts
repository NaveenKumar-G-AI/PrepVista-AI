/**
 * All the "magic numbers" behind readiness/risk/momentum/effectiveness live
 * here, in one place, on purpose — spec §34: "Use transparent thresholds.
 * Do not claim predictive certainty." Tune these per-institution instead of
 * hunting through service code.
 */
export const THRESHOLDS = {
  /** Minimum number of prior snapshots before momentum is anything but
   *  INSUFFICIENT_DATA. */
  MIN_SNAPSHOTS_FOR_MOMENTUM: 2,
  /** Overall-score point change (vs previous snapshot) to call it RISING/DECLINING. */
  MOMENTUM_DELTA: 5,

  /** Overall-score bands -> risk level. UNKNOWN (not a 0) when there's no score at all. */
  RISK_BANDS: {
    CRITICAL_BELOW: 40,
    HIGH_BELOW: 55,
    MEDIUM_BELOW: 70,
  },

  /** Attendance below this % marks a student "at risk of non-completion" (spec §15). */
  ATTENDANCE_AT_RISK_PCT: 60,

  /** Below this many completers, effectiveness numbers are withheld as
   *  "insufficient data" rather than shown as a possibly-noisy statistic
   *  (spec §44: no causal claims from tiny samples). */
  MIN_SAMPLE_FOR_EFFECTIVENESS: 5,

  /** Default per-category "placement ready" target used for gap analysis
   *  when an institution hasn't configured its own (spec §30/§18). */
  DEFAULT_CATEGORY_TARGET: 70,

  /** Below ~this many seconds per question, an assessment attempt is
   *  flagged "needs review" rather than accepted at face value (spec §26 —
   *  never an automatic accusation, just a flag). */
  MIN_SECONDS_PER_QUESTION: 4,

  /** A skill-gap this large (target - current) is treated as HIGH priority
   *  in the deterministic recommendation engine (spec §18). */
  HIGH_PRIORITY_GAP: 20,
} as const;
