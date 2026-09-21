/**
 * Every tunable heuristic in the engine lives here, named and commented,
 * rather than scattered as magic numbers. This is what makes "don't fake
 * precision" (spec section 36) auditable: these are declared assumptions,
 * not a black box.
 */
export const ENGINE_CONSTANTS = {
  // --- capability model (engine/evidence.ts) ---
  INITIAL_ABILITY: 0,
  INITIAL_UNCERTAINTY: 1.0,
  MIN_UNCERTAINTY: 0.15,
  UNCERTAINTY_DECAY: 0.85,
  BASE_LEARNING_RATE: 0.9,

  // --- confidence-label thresholds ---
  HIGH_CONFIDENCE_MIN_EVIDENCE: 4,
  MODERATE_CONFIDENCE_MIN_EVIDENCE: 2,
  HIGH_CONFIDENCE_MAX_UNCERTAINTY: 0.35,
  MODERATE_CONFIDENCE_MAX_UNCERTAINTY: 0.6,

  // --- instability / contradictory evidence detection ---
  UNSTABLE_SURPRISE_VARIANCE_THRESHOLD: 0.22,
  UNSTABLE_WINDOW: 4,

  // --- capability-label thresholds (on the same logit-like ability scale) ---
  CAPABILITY_THRESHOLDS: { emergingMax: -1.0, developingMax: 0.0, proficientMax: 1.2 },

  // --- challenge mode ---
  CHALLENGE_STREAK_REQUIRED: 3,

  // --- transfer mode ---
  TRANSFER_TRIGGER_MIN_ESTIMATE: 1.0,
  TRANSFER_TRIGGER_MAX_UNCERTAINTY: 0.45,
  TRANSFER_CONFIRM_MIN_EVIDENCE: 2,
  TRANSFER_GAP_THRESHOLD: 0.34,

  // --- response-time classification ---
  SPEED_FAST_THRESHOLD: 0.7,
  SPEED_SLOW_THRESHOLD: 1.3,

  // --- exposure / anti-memorization ---
  PATTERN_EXPOSURE_PENALTY_PER_HIT: 0.25,
  REPRESENTATION_NOVELTY_BONUS: 1.15,

  // --- fatigue ---
  FATIGUE_WINDOW: 6,
  FATIGUE_RESPONSE_TIME_INCREASE_RATIO: 1.4,
  FATIGUE_ACCURACY_DROP: 0.25,

  // --- stopping ---
  MIN_INFO_VALUE_TO_CONTINUE: 0.02,
} as const;
