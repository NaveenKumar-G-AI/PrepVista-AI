/**
 * Every threshold and weight the engine uses, in one place, so decisions
 * stay transparent and tunable instead of arbitrary magic numbers buried in
 * logic (master prompt, section 13). Each constant is named for the signal
 * it represents.
 */

// --- Confidence (src/engine/state.ts) ---
export const LOW_SAMPLE_SIZE = 3; // sampleSize below this => LOW confidence
export const HIGH_SAMPLE_SIZE = 8; // sampleSize at/above this => HIGH confidence

// --- Diagnosis thresholds (src/engine/diagnosis.ts) ---
export const CONCEPT_GAP_MASTERY = 60;
export const PREREQUISITE_WEAK_MASTERY = 60;
export const RETENTION_DECAY_MAX = 60;
export const METHOD_ERROR_MIN_OCCURRENCES = 3; // within the last 5 error tags
export const METHOD_ERROR_WINDOW = 5;
export const TRANSFER_GAP_MAX = 70;
export const TRANSFER_GAP_REQUIRES_MASTERY_AT_LEAST = 80;
export const SPEED_LIMIT_MAX = 65;
export const SPEED_LIMIT_REQUIRES_ACCURACY_AT_LEAST = 80;
export const STABLE_MIN = {
  mastery: 90,
  retention: 90,
  transfer: 85,
  accuracy: 90
};

// --- Signals: momentum / stability / regression (src/engine/signals.ts) ---
export const MOMENTUM_IMPROVING_DIFF = 5;
export const MOMENTUM_DECLINING_DIFF = -5;
export const STABILITY_MIN_SCORE = 85;
export const STABILITY_MAX_STDEV = 6;
export const REGRESSION_DROP_THRESHOLD = 15;
export const REGRESSION_POSSIBLE_CAUSES = [
  "Retention decay since last practice",
  "Higher difficulty in the most recent questions",
  "Novel question format not seen before",
  "Time pressure during the attempt",
  "Fatigue from a long session",
  "Normal random variance in a small sample"
];

// --- Candidate action base durations & impact (src/engine/candidateActions.ts) ---
export const ACTION_BASE = {
  VERIFY_LOW_EVIDENCE: { minutes: 3, baseImpact: 0.25 },
  PREREQUISITE_REVIEW: { minutes: 6, baseImpact: 0.5 },
  CONCEPT_LEARN: { minutes: 7, baseImpact: 0.4 },
  CONCEPT_PRACTICE: { minutes: 5, baseImpact: 0.4 },
  RETENTION_RECALL: { minutes: 6, baseImpact: 0.35 },
  METHOD_REPAIR: { minutes: 5, baseImpact: 0.5 },
  TRANSFER_CHALLENGE: { minutes: 6, baseImpact: 0.4 },
  TIMED_PRACTICE: { minutes: 7, baseImpact: 0.35 },
  MIX_VERIFICATION: { maxMinutes: 5, baseImpact: 0.2 },
  STABLE_STRETCH: { maxMinutes: 10, baseImpact: 0.2 }
};
export const SEVERITY_IMPACT_WEIGHT = 0.3; // how much severity scales impact on top of base

// --- Priority / expected value scoring (src/engine/priority.ts) ---
export const EV_PER_MINUTE_CEILING = 0.14; // normalizes raw expected-value/minute into 0-1; anything at/above this counts as "as good as it gets" and clips to 1.0
export const PRIORITY_WEIGHTS = {
  expectedValuePerMinute: 0.3,
  severity: 0.25,
  goalRelevance: 0.15,
  confidence: 0.1,
  momentumUrgency: 0.1,
  retentionRisk: 0.1
};
export const CONFIDENCE_WEIGHT: Record<string, number> = {
  HIGH: 1.0,
  MEDIUM: 0.65,
  LOW: 0.35
};
export const MOMENTUM_URGENCY: Record<string, number> = {
  DECLINING: 1.0,
  FLAT: 0.5,
  IMPROVING: 0.2,
  UNKNOWN: 0.5
};

// --- Fatigue heuristic (src/engine/signals.ts, used by plan.ts) ---
export const FATIGUE_MIN_ACTIONS = 2; // need at least this many completed actions this session
export const FATIGUE_ACCURACY_DROP = 0.15; // accuracy fraction drop vs topic baseline
export const FATIGUE_TIME_INCREASE_RATIO = 1.3; // response time 30% above baseline
