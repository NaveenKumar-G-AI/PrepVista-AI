// Central configuration for mastery calculation, evidence weighting,
// gap diagnosis, and recommendation ranking.
//
// Every tunable constant in the engine lives HERE and nowhere else.
// Nothing here is "final" — tune it against real outcome data once the
// engine is live. The point is that there is exactly one place to tune it.

export const MASTERY_STATES = [
  'UNKNOWN',
  'EXPOSED',
  'LEARNING',
  'DEVELOPING',
  'FUNCTIONAL',
  'STRONG',
  'MASTERED',
  'STALE',
] as const;

export type MasteryState = (typeof MASTERY_STATES)[number];

// Relative ranking used for prerequisite comparisons and target-state gaps.
// STALE is ranked alongside STRONG because staleness is a decay condition
// layered on top of a prior competence level, not a competence level of
// its own — a STALE skill was STRONG or MASTERED and needs reverification,
// it did not regress to "worse than FUNCTIONAL".
export const STATE_RANK: Record<MasteryState, number> = {
  UNKNOWN: 0,
  EXPOSED: 1,
  LEARNING: 2,
  DEVELOPING: 3,
  FUNCTIONAL: 4,
  STRONG: 5,
  MASTERED: 6,
  STALE: 5,
};

export const EVIDENCE_BASE_QUALITY = {
  solutionViewedThenPassed: 0.05,
  hintAssistedPass_heavy: 0.15, // 3+ hints, or a NEAR_SOLUTION-level hint
  hintAssistedPass_light: 0.28, // 1–2 hints, CLARIFICATION/CONCEPT_HINT level
  guidedPass: 0.32,
  independentPass_easy: 0.42,
  independentPass_medium: 0.62,
  independentPass_hard: 0.88,
  transferPass: 1.0,
  timedAssessmentPass: 1.0,
  technicalInterviewPass: 1.0,
  retentionCheckPass: 1.0,
  independentFail: 0.0, // failures never *add* mastery score; they feed gap diagnosis instead
} as const;

export const RECENCY_HALF_LIFE_DAYS = 45; // evidence "value" halves every N days for confidence purposes — it is never deleted, only discounted

export const REPETITION_DISCOUNT = {
  // Weight of the k-th attempt (0-indexed prior attempts) at the SAME
  // problem by the SAME student. Prevents "solve it 20 times" farming.
  curve: (priorAttemptsOnSameProblem: number): number =>
    Math.max(0.08, 1 / (1 + priorAttemptsOnSameProblem)),
};

export const STATE_THRESHOLDS = {
  minIndependentPassesForFunctional: 2,
  minDistinctDifficultiesForFunctional: 2,
  minIndependentPassesForMastered: 4,
  requireTransferForMastered: true,
  requireHighStakesForMastered: true, // timed assessment / interview / retention check
  recentFailWindow: 5, // look at the last N independent PRACTICE/DEBUGGING attempts for a "struggling" signal
  recentFailStreakForDevelopingCap: 3, // 3+ fails in that window caps the state at DEVELOPING
};

export const DECAY_WINDOW_DAYS: Record<'STRONG' | 'MASTERED', number> = {
  STRONG: 60,
  MASTERED: 90,
};

export const RETENTION_SCHEDULE_DAYS = [14, 30, 60]; // spaced-repetition-style steps after a skill first qualifies as STRONG/MASTERED

export const CONFIDENCE_WEIGHTS = {
  volume: 0.3, // more corroborating evidence -> more confidence (diminishing returns)
  diversity: 0.25, // evidence from multiple distinct sources -> more confidence
  recency: 0.2, // recent evidence counts more than old evidence
  consistency: 0.25, // few contradicting recent fails -> more confidence
};

export const RECOMMENDATION_WEIGHTS = {
  roleImportance: 0.3,
  masteryGap: 0.25,
  prerequisiteBonus: 0.15,
  retentionRisk: 0.15,
  transferGap: 0.1,
  recencyPenalty: 0.05, // de-prioritize a skill recommended and dismissed very recently
};

export const ANTI_GAMING = {
  rapidRepeatWindowMinutes: 20,
  rapidRepeatFlagThreshold: 3, // 3+ submissions of the same problem inside the window gets flagged
};
