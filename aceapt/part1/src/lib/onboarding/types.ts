/**
 * ACEAPT AI — Feature 1: Onboarding data contract.
 *
 * CORE PRINCIPLE (spec section 3 & 26): self-reported information is not actual skill.
 * `SelfPerceivedConfidence` and `MeasuredCapability` are two different types on purpose —
 * nothing in this file lets one be assigned where the other is expected, and no code in this
 * feature ever writes to MeasuredCapability. That's the Diagnostic Engine's job (Feature 2).
 */

// ---------------------------------------------------------------------------------------------
// Enums (as string literal unions — matches how they're stored and keeps the wire format plain)
// ---------------------------------------------------------------------------------------------

export const PREPARATION_GOALS = [
  "CAMPUS_PLACEMENT",
  "APTITUDE_ASSESSMENT",
  "COMPETITIVE_EXAM",
  "GENERAL_IMPROVEMENT",
  "UPCOMING_ASSESSMENT",
  "OTHER",
] as const;
export type PreparationGoal = (typeof PREPARATION_GOALS)[number];

export const PRIMARY_OBJECTIVES = [
  "IMPROVE_SCORE",
  "BECOME_FASTER",
  "FIX_WEAK_TOPICS",
  "BUILD_FUNDAMENTALS",
  "PREPARE_FOR_PLACEMENT_TESTS",
  "BUILD_CONFIDENCE_UNFAMILIAR",
  "MAINTAIN_STRENGTH",
] as const;
export type PrimaryObjective = (typeof PRIMARY_OBJECTIVES)[number];

export const TIMELINE_CATEGORIES = [
  "WITHIN_2_WEEKS",
  "WITHIN_1_MONTH",
  "ONE_TO_THREE_MONTHS",
  "THREE_TO_SIX_MONTHS",
  "NOT_SURE",
] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

export const EXPERIENCE_LEVELS = [
  "BASICS",
  "SOME_CONCEPTS",
  "CAN_SOLVE_COMMON",
  "COMFORTABLE_NEEDS_PRACTICE",
  "ALREADY_STRONG",
  "NOT_SURE",
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const PREVIOUS_PREPARATION_LEVELS = [
  "NEVER",
  "OCCASIONALLY",
  "REGULARLY",
  "COMPLETED_TRAINING",
  "TAKEN_ASSESSMENTS",
] as const;
export type PreviousPreparation = (typeof PREVIOUS_PREPARATION_LEVELS)[number];

export const DIFFICULTY_AREAS = [
  "UNDERSTANDING_CONCEPTS",
  "REMEMBERING_FORMULAS",
  "APPLYING_FORMULAS",
  "SOLVING_UNFAMILIAR",
  "TIME_PRESSURE",
  "LOGICAL_REASONING",
  "CALCULATION",
  "UNDERSTANDING_QUESTIONS",
  "MAINTAINING_ACCURACY",
  "UNKNOWN",
] as const;
export type DifficultyArea = (typeof DIFFICULTY_AREAS)[number];

export const CONFIDENCE_LEVELS = ["LOW", "DEVELOPING", "MODERATE", "STRONG", "VERY_STRONG"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const AVAILABILITY_CATEGORIES = [
  "MIN_10",
  "MIN_20",
  "MIN_30",
  "MIN_45",
  "HOUR_1",
  "HOUR_1_2",
  "HOUR_2_PLUS",
  "VARIES",
] as const;
export type AvailabilityCategory = (typeof AVAILABILITY_CATEGORIES)[number];

export const AVAILABILITY_MINUTES: Record<AvailabilityCategory, number | null> = {
  MIN_10: 10,
  MIN_20: 20,
  MIN_30: 30,
  MIN_45: 45,
  HOUR_1: 60,
  HOUR_1_2: 90,
  HOUR_2_PLUS: 120,
  VARIES: null, // genuinely unknown day to day — do not invent a number (spec section 21)
};

export const STUDY_TIMES = ["MORNING", "AFTERNOON", "EVENING", "NIGHT", "FLEXIBLE"] as const;
export type StudyTime = (typeof STUDY_TIMES)[number];

export const ASSISTANCE_MODES = [
  "SIMPLE_EXPLANATION",
  "WORKED_EXAMPLE",
  "HINT",
  "VISUAL_EXPLANATION",
  "FORMULA_SHORTCUT",
  "STEP_BY_STEP",
  "TRY_MYSELF",
] as const;
export type AssistanceMode = (typeof ASSISTANCE_MODES)[number];

export const DIFFICULTY_PREFERENCES = ["START_EASY", "BALANCED", "CHALLENGE_QUICKLY", "NOT_SURE"] as const;
export type DifficultyPreference = (typeof DIFFICULTY_PREFERENCES)[number];

export const PAIN_POINTS = [
  "DONT_KNOW_WHERE_TO_START",
  "FORGET_CONCEPTS",
  "CANT_SOLVE_NEW_QUESTIONS",
  "TAKE_TOO_LONG",
  "CARELESS_MISTAKES",
  "PANIC_DURING_TESTS",
  "CONFUSING_QUESTIONS",
  "PRACTICE_NO_IMPROVEMENT",
  "DONT_KNOW_WEAKNESS",
  "LOSE_MOTIVATION",
  "EVERYTHING_DIFFICULT",
  "SOMETHING_ELSE",
] as const;
export type PainPoint = (typeof PAIN_POINTS)[number];

export const TARGET_SCORE_OPTIONS = ["SCORE_70", "SCORE_80", "SCORE_90", "TOP_PERFORMANCE", "NOT_SURE"] as const;
export type TargetScoreOption = (typeof TARGET_SCORE_OPTIONS)[number];

export const ONBOARDING_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

// ---------------------------------------------------------------------------------------------
// Self-perception (Feature 1 owns this) vs. measured capability (Feature 2 owns this)
// ---------------------------------------------------------------------------------------------

export interface SelfPerceivedConfidence {
  quantitative: ConfidenceLevel | null;
  logical: ConfidenceLevel | null;
  verbal: ConfidenceLevel | null;
  timePressure: ConfidenceLevel | null;
}

/**
 * Not populated by this feature. Included in the contract so the shape is visible to anyone
 * integrating against it, and so `StudentOnboardingContext` can carry a typed placeholder
 * rather than future code bolting an untyped field on later.
 */
export interface MeasuredCapability {
  quantitative: number | null; // 0–1, set by the Diagnostic Engine
  logical: number | null;
  verbal: number | null;
  timePressure: number | null;
  measuredAt: string | null; // ISO datetime
  sourceDiagnosticId: string | null;
}

export interface OnboardingSummary {
  text: string;
  source: "ai" | "deterministic";
  model: string | null;
  generatedAt: string | null;
}

export interface StudentOnboardingContext {
  studentId: string;

  preparationGoal: PreparationGoal | null;
  preparationGoalOther: string | null;

  primaryObjective: PrimaryObjective | null;
  secondaryObjectives: PrimaryObjective[];

  timelineCategory: TimelineCategory | null;
  targetDate: string | null; // ISO date (YYYY-MM-DD), student-supplied, never fabricated
  daysAvailable: number | null; // derived from targetDate + server's actual current date

  experienceLevel: ExperienceLevel | null;

  previousPreparation: PreviousPreparation | null;
  previousDifficulties: DifficultyArea[];

  selfPerceivedConfidence: SelfPerceivedConfidence;
  measuredCapability: MeasuredCapability; // always empty from this feature — see doc-comment above

  dailyAvailability: AvailabilityCategory | null;
  dailyAvailabilityMinutes: number | null;
  preferredStudyTime: StudyTime | null;

  preferredAssistanceModes: AssistanceMode[];
  initialDifficultyPreference: DifficultyPreference | null;

  primaryPainPoint: PainPoint | null;
  secondaryPainPoints: PainPoint[];

  targetScore: TargetScoreOption | null;

  onboardingStatus: OnboardingStatus;
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  lastEditedAt: string | null;
  contextVersion: number;

  summary: OnboardingSummary | null;

  createdAt: string;
  updatedAt: string;
}

export function emptyContext(studentId: string, now = new Date()): StudentOnboardingContext {
  const iso = now.toISOString();
  return {
    studentId,
    preparationGoal: null,
    preparationGoalOther: null,
    primaryObjective: null,
    secondaryObjectives: [],
    timelineCategory: null,
    targetDate: null,
    daysAvailable: null,
    experienceLevel: null,
    previousPreparation: null,
    previousDifficulties: [],
    selfPerceivedConfidence: { quantitative: null, logical: null, verbal: null, timePressure: null },
    measuredCapability: {
      quantitative: null,
      logical: null,
      verbal: null,
      timePressure: null,
      measuredAt: null,
      sourceDiagnosticId: null,
    },
    dailyAvailability: null,
    dailyAvailabilityMinutes: null,
    preferredStudyTime: null,
    preferredAssistanceModes: [],
    initialDifficultyPreference: null,
    primaryPainPoint: null,
    secondaryPainPoints: [],
    targetScore: null,
    onboardingStatus: "NOT_STARTED",
    onboardingStartedAt: null,
    onboardingCompletedAt: null,
    lastEditedAt: null,
    contextVersion: 1,
    summary: null,
    createdAt: iso,
    updatedAt: iso,
  };
}

// ---------------------------------------------------------------------------------------------
// Event tracking (spec section 30) — a fixed, meaningful set, not one per UI interaction.
// ---------------------------------------------------------------------------------------------

export const ONBOARDING_EVENTS = {
  ONBOARDING_STARTED: "ONBOARDING_STARTED",
  GOAL_SELECTED: "GOAL_SELECTED",
  OBJECTIVE_SELECTED: "OBJECTIVE_SELECTED",
  TIMELINE_SELECTED: "TIMELINE_SELECTED",
  EXPERIENCE_SELECTED: "EXPERIENCE_SELECTED",
  PREVIOUS_PREPARATION_SELECTED: "PREVIOUS_PREPARATION_SELECTED",
  PREVIOUS_DIFFICULTIES_SELECTED: "PREVIOUS_DIFFICULTIES_SELECTED",
  CONFIDENCE_COMPLETED: "CONFIDENCE_COMPLETED",
  AVAILABILITY_SELECTED: "AVAILABILITY_SELECTED",
  STUDY_SCHEDULE_SELECTED: "STUDY_SCHEDULE_SELECTED",
  ASSISTANCE_PREFERENCE_SELECTED: "ASSISTANCE_PREFERENCE_SELECTED",
  DIFFICULTY_PREFERENCE_SELECTED: "DIFFICULTY_PREFERENCE_SELECTED",
  PAIN_POINT_SELECTED: "PAIN_POINT_SELECTED",
  TARGET_SCORE_SELECTED: "TARGET_SCORE_SELECTED",
  ONBOARDING_COMPLETED: "ONBOARDING_COMPLETED",
  ONBOARDING_ABANDONED: "ONBOARDING_ABANDONED",
  ONBOARDING_RESUMED: "ONBOARDING_RESUMED",
  ONBOARDING_EDITED: "ONBOARDING_EDITED",
  DIAGNOSTIC_STARTED: "DIAGNOSTIC_STARTED",
} as const;
export type OnboardingEventType = (typeof ONBOARDING_EVENTS)[keyof typeof ONBOARDING_EVENTS];
