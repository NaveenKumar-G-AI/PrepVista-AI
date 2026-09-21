/**
 * Every threshold the retention engine uses lives here, named and
 * commented, on purpose. Per the spec's "scientific honesty" principle:
 * these are heuristic starting points chosen to make the prototype's
 * behaviour legible and testable — NOT validated cognitive-science
 * constants, and not claimed to be. Once real longitudinal data exists
 * across many students, these are exactly the numbers to re-tune.
 */
export const RETENTION_CONFIG = {
  // --- Decay classification ------------------------------------------
  STABLE_DECLINE_THRESHOLD: 0.08, // <8pt drop from peak: still STABLE
  DECAYING_DECLINE_THRESHOLD: 0.25, // >25pt drop: AT_RISK regardless of floor
  AT_RISK_MIN_PERFORMANCE: 0.5, // recent score below this: AT_RISK regardless of decline size
  FORGOTTEN_MIN_PERFORMANCE: 0.35,
  FORGOTTEN_MIN_DAYS_ELAPSED: 3,
  RECENT_DELAYED_WINDOW: 2, // how many of the most recent delayed checks define "current" retention

  // --- Confidence -------------------------------------------------------
  HIGH_CONFIDENCE_MIN_CHECKS: 3,
  MAX_VARIANCE_FOR_MEDIUM: 0.05,
  MAX_VARIANCE_FOR_HIGH: 0.06,

  // --- Recovery / escalation --------------------------------------------
  RECOVERY_CYCLES_BEFORE_ESCALATION: 2,
  ESCALATION_LEVEL_FOR_RETEACH: 2, // at/above this, broaden to a worked example instead of drilling further

  // --- Retention windows (days). Configurable, not claimed universal. ---
  RETENTION_WINDOWS_DAYS: { immediate: 0, short: 1, medium: 3, long: 7 },

  // --- Priority / workload ------------------------------------------------
  DEFAULT_WORKLOAD_CAP: 3,

  // --- Risk formula weights (see retentionEngine.computeRetentionRisk) ---
  RISK_DECLINE_WEIGHT: 1.2,
  RISK_TIME_DIVISOR_DAYS: 30,
  RISK_TIME_CAP: 0.3,
  RISK_RECURRING_BONUS: 0.15,
  RISK_TARGET_IMPORTANCE_FLOOR: 0.6,
  RISK_TARGET_IMPORTANCE_WEIGHT: 0.4,

  // --- Priority formula weights (see priorityEngine.computeMemoryPriorities) ---
  PRIORITY_TARGET_FLOOR: 0.4,
  PRIORITY_TARGET_WEIGHT: 0.6,
  PRIORITY_RECURRENCE_BONUS: 0.06,
  PRIORITY_VERIFICATION_BONUS: 0.18,
  PRIORITY_UPCOMING_ASSESSMENT_BONUS: 0.1,
};

export const APP_CONFIG = {
  PORT: Number(process.env.PORT ?? 4000),
  DEMO_MODE: (process.env.DEMO_MODE ?? 'true') === 'true',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
};
