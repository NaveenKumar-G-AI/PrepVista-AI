import { ReadinessDimension, ReadinessState } from '../domain/types';

/**
 * READINESS MODEL v1
 * ---------------------------------------------------------------------------
 * Spec section 55 is explicit: "the readiness formula must be explainable,
 * configurable, evidence-based, testable, and versioned... avoid fake
 * precision." This file is the single place that defines the formula.
 *
 * Honesty note (read this before trusting the numbers):
 * The weights below are a reasonable prototype starting point, not a
 * statistically-fitted model - there is no historical outcome data (e.g.
 * "did this student actually clear a real placement test") to calibrate
 * against yet. What IS real: every input feeding the formula is computed
 * from genuine, server-recorded attempt/timing data (services/readinessService.ts),
 * nothing here is randomized or hardcoded per-request. Treat MODEL_VERSION as
 * the seam for replacing these weights with calibrated ones once outcome data
 * exists, without touching the services that call it.
 */
export const READINESS_MODEL_VERSION = 'readiness_model_v1';

/** Must sum to 1.0 - enforced by a startup assertion in readinessService.ts */
export const DIMENSION_WEIGHTS: Record<ReadinessDimension, number> = {
  ACCURACY: 0.25,
  TIME_MANAGEMENT: 0.15,
  CONSISTENCY: 0.15,
  DIFFICULTY_STABILITY: 0.1,
  CONCEPT_STABILITY: 0.1,
  SPEED: 0.1,
  EXAM_PRESSURE_PERFORMANCE: 0.05,
  QUESTION_SELECTION: 0.05,
  STRATEGY_EFFECTIVENESS: 0.05,
};

/** When a dimension can't be scored (insufficient evidence), substitute this neutral value
 *  rather than zero, so missing data doesn't unfairly tank the overall score. */
export const UNSCORED_DIMENSION_DEFAULT = 55;

/** Lower bound (inclusive) for each readiness state band, 0-100. */
export const READINESS_STATE_BANDS: { state: ReadinessState; min: number }[] = [
  { state: 'HIGHLY_READY', min: 85 },
  { state: 'READY', min: 75 },
  { state: 'APPROACHING_READY', min: 65 },
  { state: 'DEVELOPING', min: 55 },
  { state: 'FOUNDATION', min: 40 },
  { state: 'NOT_READY', min: 0 },
];

export function scoreToState(score: number): ReadinessState {
  for (const band of READINESS_STATE_BANDS) {
    if (score >= band.min) return band.state;
  }
  return 'NOT_READY';
}

/**
 * Evidence-confidence rules (section 32). Confidence is deliberately SEPARATE
 * from the score itself - a student can be at 78% readiness with LOW
 * confidence after one lucky assessment, or 78% with HIGH confidence after
 * five consistent ones. Thresholds are on completed-assessment count and how
 * many distinct topics have been covered at least twice.
 */
export const CONFIDENCE_RULES = {
  HIGH: { minAssessments: 4, minTopicsCoveredTwice: 5 },
  MEDIUM: { minAssessments: 2, minTopicsCoveredTwice: 2 },
  // Anything below MEDIUM's thresholds is LOW.
};

/** Difficulty-curve "drop" beyond this many percentage points between adjacent
 *  difficulty tiers is penalized in DIFFICULTY_STABILITY (section 28). */
export const DIFFICULTY_DROP_PENALTY_THRESHOLD_PCT = 25;

/** Practice-vs-assessment accuracy gap (percentage points) beyond which
 *  EXAM_PRESSURE_PERFORMANCE starts being penalized (section 24/25). */
export const PRESSURE_GAP_PENALTY_THRESHOLD_PCT = 10;
