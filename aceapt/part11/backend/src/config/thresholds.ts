/**
 * Centralized, documented thresholds for Feature 11 signal detection.
 *
 * Per the brief's "No Magic Numbers" rule: every heuristic constant used by
 * the signal engine lives here, with a short rationale. Nothing under
 * src/domain/signals/* should contain an inline numeric threshold - if a
 * calculation needs one, it gets added here first, so it stays visible,
 * documented, and easy to retune without touching calculation logic.
 *
 * These are intentionally simple, explainable heuristics for the current
 * rule-based engine (see README "Future ML readiness"). They are safe to
 * retune per-cohort later without changing any detector's code, since every
 * detector reads from this one object.
 */
export const THRESHOLDS = {
  windows: {
    RECENT_DAYS: 3,
    SHORT_DAYS: 7,
    MEDIUM_DAYS: 14,
    LONG_DAYS: 30,
  },

  consistency: {
    // Weight of "how many days were active" vs "how evenly spaced they were"
    COVERAGE_WEIGHT: 0.6,
    REGULARITY_WEIGHT: 0.4,
    BUCKETS: {
      HIGHLY_IRREGULAR_MAX: 0.25,
      IRREGULAR_MAX: 0.45,
      MODERATE_MAX: 0.7,
      // above MODERATE_MAX => CONSISTENT
    },
  },

  returnToLearning: {
    INACTIVITY_GAP_DAYS: 5,
  },

  sessionBehavior: {
    HIGH_COMPLETION_MIN: 0.75,
    LOW_COMPLETION_MAX: 0.4,
  },

  abandonment: {
    MIN_ABANDONED_FOR_SIGNAL: 3,
    // Abandonment points (0-1 progress fraction) within this spread are
    // treated as a genuinely *repeated* pattern, not incidental scatter.
    MAX_SPREAD_FOR_REPEATED_PATTERN: 0.2,
  },

  challengeEngagement: {
    LOW_EXPOSURE_MAX_HARD_MEDIUM_SHARE: 0.2,
    STRONG_ACCEPTANCE_MIN_HARD_MEDIUM_SHARE: 0.45,
    MIN_QUESTIONS_FOR_SIGNAL: 10,
  },

  persistence: {
    LOW_MAX_RETRY_RATE: 0.3,
    STRONG_MIN_RETRY_RATE: 0.65,
    MIN_WRONG_ANSWERS_FOR_SIGNAL: 6,
  },

  recovery: {
    LOOKBACK_DAYS_AFTER_POOR_RESULT: 7,
    POOR_ASSESSMENT_SCORE_MAX: 0.5,
    MIN_POOR_ASSESSMENTS_FOR_SIGNAL: 1,
  },

  assistanceDependency: {
    HIGH_MIN_RATE: 0.5,
    LOW_MAX_RATE: 0.15,
    MIN_ANSWERED_FOR_SIGNAL: 8,
  },

  confidenceCalibration: {
    // Gap in percentage points between avg self-reported confidence and
    // actual outcome rate, beyond which we call it over/under-confidence.
    MISMATCH_MIN_GAP_POINTS: 20,
    MIN_RECORDED_FOR_SIGNAL: 8,
  },

  planAdherence: {
    STRONG_MIN_COMPLETION_RATE: 0.75,
    LOW_MAX_COMPLETION_RATE: 0.4,
    // If actual session duration is persistently below planned duration by
    // at least this fraction, across enough independent days, the PLAN
    // itself (not the student) may be unrealistic. See section 9.
    REALISM_MISMATCH_MIN_GAP_RATIO: 0.35,
    REALISM_MISMATCH_MIN_DAYS: 4,
    MIN_PLANNED_SESSIONS_FOR_SIGNAL: 4,
  },

  learningRhythm: {
    DURATION_BUCKET_EDGES_MINUTES: [15, 30, 45],
    MIN_SESSIONS_PER_BUCKET: 3,
    // A bucket must beat the next-best bucket's accuracy by at least this
    // many points to be called a "preference" rather than noise.
    MIN_ACCURACY_ADVANTAGE_POINTS: 8,
  },

  cramming: {
    LOW_ACTIVITY_MINUTES_PER_DAY: 5,
    LOW_ACTIVITY_MIN_CONSECUTIVE_DAYS: 3,
    SPIKE_MULTIPLIER_OF_ROLLING_AVERAGE: 3,
  },

  friction: {
    QUESTION_MIN_ATTEMPTS_FOR_SIGNAL: 4,
    QUESTION_ABANDON_OR_SKIP_RATE_FLAG: 0.4,
    QUESTION_HINT_RATE_FLAG: 0.5,
    CROSS_STUDENT_MIN_STUDENTS_FOR_CONTENT_SIGNAL: 4,
  },

  workload: {
    // A rough sustainable-throughput ceiling used only to flag a plan for
    // human review - never to silently auto-shrink it. See section 15.
    MAX_SUSTAINABLE_ITEMS_PER_DAY: 12,
    IMBALANCE_MIN_TOPIC_SHARE: 0.6, // one topic >=60% of practice time while >=2 other weak topics exist
    IMBALANCE_MIN_OTHER_WEAK_TOPICS: 2,
  },

  confidenceScoring: {
    // Generic evidence-count -> confidence curve shared by every detector.
    // See domain/signals/confidenceScore.ts.
    LOW_EVIDENCE_MAX: 5,
    MEDIUM_EVIDENCE_MAX: 15,
  },
} as const;
