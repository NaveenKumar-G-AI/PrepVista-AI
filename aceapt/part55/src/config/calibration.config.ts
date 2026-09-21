/**
 * Every magic number in the calibration engine lives here. Spec §17, §57,
 * §107, §123 all say the same thing in different words: don't hardcode
 * thresholds inline, and don't pretend any of these numbers are universal
 * truths — they're P0 defaults for a placement-prep population and are
 * meant to be tuned (per tenant, per population, per assessment context)
 * without touching the estimator/eligibility/anomaly code itself.
 */

export const calibrationConfig = {
  eligibility: {
    /** Below this, a response time is almost certainly a logging glitch,
     * not a real (if implausibly fast) answer. */
    minAttemptDurationMs: 300,
    /** Above this for a single question, treat timing as unreliable for
     * *time* statistics — the attempt can still count for facility. */
    maxPlausibleDurationMs: 30 * 60 * 1000,
    excludeTestAccounts: true,
    requireCompletedAttempt: true,
  },

  sampleSize: {
    /** Fewer than this and we don't even attempt an empirical estimate —
     * the snapshot stays on the initial/structural estimate. */
    provisionalMin: 1,
    /** §216's "do not label an item Hard because one student failed", made
     * concrete: below this many eligible attempts, the STUDENT-FACING
     * category still comes from the initial estimate, even though the raw
     * empirical facility is already recorded (visible to admins) for
     * transparency. Deliberately higher than `provisionalMin`. */
    categoryEmpiricalMin: 5,
    /** At or above this, OVERALL facility is allowed to leave PROVISIONAL
     * and become CALIBRATED (spec §14, §69: never calibrate off 2-3 attempts). */
    calibratedMin: 30,
    /** A conditioned mode (TIMED, NOVEL, GUIDED, ...) needs its own sample
     * this large before it gets its own snapshot at all — see §21, §74. */
    conditionedModeMin: 30,
    timeStatsMin: 10,
    /** Discrimination needs enough spread across ability terciles to mean
     * anything (§67, §69) — deliberately higher than the facility minimum. */
    discriminationMin: 45,
    /** Minimum attempts in the *recent* window before a drift check even
     * runs — comparing 3 recent attempts to a 500-attempt baseline is noise,
     * not drift (§60-62). */
    driftMin: 30,
  },

  confidence: {
    // Confidence is bucketed off BOTH sample size and how wide the Wilson
    // interval still is, so a narrow interval born from a tiny-but-lucky
    // sample can't masquerade as HIGH confidence.
    high: { minSample: 200, maxIntervalWidth: 0.12 },
    medium: { minSample: 30, maxIntervalWidth: 0.25 },
    // anything below `medium` is LOW
  },

  /** Facility -> student-facing category. P0 default only (§57) — real
   * deployments should be able to override this per population/skill without
   * a code change; see DifficultyEstimator.categoryOverrides. */
  category: {
    easyFacilityMin: 0.75,
    hardFacilityMax: 0.4,
  },

  anomaly: {
    tooEasyFacilityMin: 0.97,
    tooHardFacilityMax: 0.08,
    /** Facility gap between the top and bottom ability terciles that counts
     * as "high variance" (§66). */
    highVarianceMinGap: 0.35,
    weakDiscriminationMax: 0.1,
    /** Recent median time vs. historical median time ratio that counts as
     * "unexpectedly slow/fast" (§63). */
    unexpectedTimeRatioHigh: 2.0,
    unexpectedTimeRatioLow: 0.5,
  },

  drift: {
    /** Two-proportion z-test p-value threshold — deliberately strict so a
     * drift flag means something (§61: drift ≠ error, investigate first). */
    pValueThreshold: 0.01,
    /** Even a "significant" shift below this absolute facility change isn't
     * worth a human's time. */
    minAbsoluteFacilityShift: 0.08,
    recentWindowDays: 60,
  },

  cache: {
    ttlSeconds: 3600,
  },

  /** Structural-complexity weights for the P0 initial estimate (§29-30).
   * Purely a starting hypothesis — never treated as empirical truth, and
   * always overridden once real evidence exists (§32, §95). */
  structural: {
    weights: {
      numberOfSteps: 0.3,
      numberOfVariables: 0.2,
      numberOfConstraints: 0.2,
      conceptDependencies: 0.2,
      readingLength: 0.1,
    },
    // rough normalization ceilings; a question at or above this value for a
    // given signal contributes that signal's full weight
    normalizationCeilings: {
      numberOfSteps: 6,
      numberOfVariables: 5,
      numberOfConstraints: 4,
      conceptDependencies: 4,
      readingLength: 400, // characters
    },
  },
} as const;

export type DifficultyMode =
  | 'OVERALL'
  | 'UNTIMED'
  | 'TIMED'
  | 'FAMILIAR'
  | 'NOVEL'
  | 'INDEPENDENT'
  | 'GUIDED';

export const CONDITIONED_MODES: DifficultyMode[] = [
  'UNTIMED',
  'TIMED',
  'FAMILIAR',
  'NOVEL',
  'INDEPENDENT',
  'GUIDED',
];

export function facilityToCategory(
  facility: number,
  overrides?: Partial<typeof calibrationConfig.category>
): 'EASY' | 'MEDIUM' | 'HARD' {
  const cfg = { ...calibrationConfig.category, ...overrides };
  if (facility >= cfg.easyFacilityMin) return 'EASY';
  if (facility <= cfg.hardFacilityMax) return 'HARD';
  return 'MEDIUM';
}

export function labelToCategory(label: string | null | undefined): 'EASY' | 'MEDIUM' | 'HARD' | null {
  if (!label) return null;
  const normalized = label.trim().toUpperCase();
  if (normalized === 'EASY' || normalized === 'MEDIUM' || normalized === 'HARD') return normalized;
  return null;
}
