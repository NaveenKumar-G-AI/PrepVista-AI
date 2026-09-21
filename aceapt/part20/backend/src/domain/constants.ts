export const MAIN_BLUEPRINT_SLUG = "main-15q-18min";
export const DEMO_STUDENT_SLUG_NAME = "Demo Student";

export const MARKING = {
  correct: 1,
  wrong: -0.25,
  skip: 0,
} as const;

// Tunable thresholds for the deterministic analytics engine (engine/analytics.ts).
// Keeping these named and centralized makes them easy to recalibrate per
// company/assessment-profile later (Feature 20 §24) without touching logic.
export const ANALYTICS_THRESHOLDS = {
  // A question counts as "overinvested" if it took at least this many
  // seconds AND at least this multiple of the session's average time/question.
  overinvestmentMinSec: 90,
  overinvestmentMultiplier: 2.2,
  // Segment-degradation is flagged when accuracy falls at least this many
  // percentage points from the first third of the test to the last third.
  degradationThresholdPct: 15,
  // A single question (or the top two combined) is called out as the
  // headline "biggest leak" once it crosses this share of total time.
  biggestLeakTimeSharePct: 18,
  // Selection-quality tiers, based on overinvested-question count and the
  // combined time share of the two slowest questions.
  selectionWeakOverinvestedCount: 2,
  selectionWeakTopTwoTimeSharePct: 25,
  selectionModerateTopTwoTimeSharePct: 18,
} as const;

export const DRILL = {
  questionCount: 4,
  durationSec: 3 * 60,
} as const;
