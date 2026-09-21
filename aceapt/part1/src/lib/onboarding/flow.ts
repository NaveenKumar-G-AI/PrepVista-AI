/**
 * ACEAPT AI — Feature 1: the onboarding flow engine.
 *
 * Spec section 19 asks for "a configurable question-flow mechanism" so future branching
 * doesn't require rewriting UI components. This file is that mechanism: steps are data, each
 * with an optional `isVisible` predicate over the answers collected so far. The wizard
 * component (OnboardingWizard.tsx) and the generic StepRenderer never hardcode a question list
 * — they always ask this module "what's visible right now, and what comes next."
 *
 * Two concrete branches are wired up as proof this works end-to-end (spec's own example in
 * section 19 plus one more): the "what's been difficult" step only appears if the student has
 * actually prepared before, and the optional target-date field only appears for goals where a
 * fixed date is likely to exist. Adding a new branch is a one-line `isVisible` predicate, not a
 * new component.
 */

import type { StudentOnboardingContext } from "./types";
import type { StepId } from "./validation";
import {
  PREPARATION_GOALS,
  PRIMARY_OBJECTIVES,
  TIMELINE_CATEGORIES,
  EXPERIENCE_LEVELS,
  PREVIOUS_PREPARATION_LEVELS,
  DIFFICULTY_AREAS,
  AVAILABILITY_CATEGORIES,
  AVAILABILITY_MINUTES,
  STUDY_TIMES,
  ASSISTANCE_MODES,
  DIFFICULTY_PREFERENCES,
  PAIN_POINTS,
  TARGET_SCORE_OPTIONS,
  ONBOARDING_EVENTS,
  type OnboardingEventType,
} from "./types";

export type StepType =
  | "SINGLE_SELECT"
  | "MULTI_SELECT_WITH_PRIMARY"
  | "MULTI_SELECT"
  | "CONFIDENCE_GRID"
  | "SUMMARY"
  | "TRANSITION";

export interface StepOption {
  value: string;
  label: string;
  helper?: string;
}

export interface StepDefinition {
  id: string;
  type: StepType;
  eyebrow: string;
  title: string;
  subtitle?: string;
  clarification?: string; // e.g. the section-10 "your diagnostic will determine..." note
  options?: readonly StepOption[];
  optional?: boolean;
  allowOther?: boolean; // goal step: "Other" reveals a free-text field
  allowDate?: boolean; // timeline step: optional target date picker
  fieldKey?: string; // SINGLE_SELECT / MULTI_SELECT: which draft key holds the answer
  primaryFieldKey?: string; // MULTI_SELECT_WITH_PRIMARY: draft key for the primary choice
  secondaryFieldKey?: string; // MULTI_SELECT_WITH_PRIMARY: draft key for secondary choices
  /** Only relevant while the step is being answered for the first time; visibility is
   *  re-evaluated against the latest context every render, so branches react live. */
  isVisible?: (ctx: Partial<StudentOnboardingContext>) => boolean;
}

const label = (s: string) =>
  s
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");

export const GOAL_OPTIONS: StepOption[] = [
  { value: "CAMPUS_PLACEMENT", label: "Campus Placement" },
  { value: "APTITUDE_ASSESSMENT", label: "Aptitude Assessment" },
  { value: "COMPETITIVE_EXAM", label: "Competitive Exam" },
  { value: "GENERAL_IMPROVEMENT", label: "General Aptitude Improvement" },
  { value: "UPCOMING_ASSESSMENT", label: "Upcoming Assessment" },
  { value: "OTHER", label: "Other" },
];

export const OBJECTIVE_OPTIONS: StepOption[] = [
  { value: "IMPROVE_SCORE", label: "Improve aptitude score" },
  { value: "BECOME_FASTER", label: "Become faster" },
  { value: "FIX_WEAK_TOPICS", label: "Fix weak topics" },
  { value: "BUILD_FUNDAMENTALS", label: "Build fundamentals" },
  { value: "PREPARE_FOR_PLACEMENT_TESTS", label: "Prepare for placement tests" },
  { value: "BUILD_CONFIDENCE_UNFAMILIAR", label: "Become confident solving unfamiliar problems" },
  { value: "MAINTAIN_STRENGTH", label: "Maintain existing aptitude strength" },
];

export const TIMELINE_OPTIONS: StepOption[] = [
  { value: "WITHIN_2_WEEKS", label: "Within 2 weeks" },
  { value: "WITHIN_1_MONTH", label: "Within 1 month" },
  { value: "ONE_TO_THREE_MONTHS", label: "1–3 months" },
  { value: "THREE_TO_SIX_MONTHS", label: "3–6 months" },
  { value: "NOT_SURE", label: "Not sure" },
];

export const EXPERIENCE_OPTIONS: StepOption[] = [
  { value: "BASICS", label: "I'm starting from the basics" },
  { value: "SOME_CONCEPTS", label: "I've learned some concepts" },
  { value: "CAN_SOLVE_COMMON", label: "I can solve common questions" },
  { value: "COMFORTABLE_NEEDS_PRACTICE", label: "I'm comfortable but need practice" },
  { value: "ALREADY_STRONG", label: "I'm already strong" },
  { value: "NOT_SURE", label: "I'm not sure" },
];

export const PREVIOUS_PREP_OPTIONS: StepOption[] = [
  { value: "NEVER", label: "Never" },
  { value: "OCCASIONALLY", label: "Occasionally" },
  { value: "REGULARLY", label: "Regularly" },
  { value: "COMPLETED_TRAINING", label: "Completed aptitude training" },
  { value: "TAKEN_ASSESSMENTS", label: "Have taken placement assessments" },
];

export const DIFFICULTY_AREA_OPTIONS: StepOption[] = [
  { value: "UNDERSTANDING_CONCEPTS", label: "Understanding concepts" },
  { value: "REMEMBERING_FORMULAS", label: "Remembering formulas" },
  { value: "APPLYING_FORMULAS", label: "Applying formulas" },
  { value: "SOLVING_UNFAMILIAR", label: "Solving unfamiliar questions" },
  { value: "TIME_PRESSURE", label: "Time pressure" },
  { value: "LOGICAL_REASONING", label: "Logical reasoning" },
  { value: "CALCULATION", label: "Calculation" },
  { value: "UNDERSTANDING_QUESTIONS", label: "Understanding questions" },
  { value: "MAINTAINING_ACCURACY", label: "Maintaining accuracy" },
  { value: "UNKNOWN", label: "I don't know" },
];

export const AVAILABILITY_OPTIONS: StepOption[] = AVAILABILITY_CATEGORIES.map((v) => ({
  value: v,
  label:
    v === "VARIES"
      ? "Varies every day"
      : v === "HOUR_1_2"
        ? "1–2 hours"
        : v === "HOUR_2_PLUS"
          ? "2+ hours"
          : v === "HOUR_1"
            ? "1 hour"
            : `${AVAILABILITY_MINUTES[v]} minutes`,
}));

export const STUDY_TIME_OPTIONS: StepOption[] = [
  { value: "MORNING", label: "Morning" },
  { value: "AFTERNOON", label: "Afternoon" },
  { value: "EVENING", label: "Evening" },
  { value: "NIGHT", label: "Night" },
  { value: "FLEXIBLE", label: "Whenever I have free time" },
];

export const ASSISTANCE_OPTIONS: StepOption[] = [
  { value: "SIMPLE_EXPLANATION", label: "Simple explanation" },
  { value: "WORKED_EXAMPLE", label: "Worked example" },
  { value: "HINT", label: "Hint" },
  { value: "VISUAL_EXPLANATION", label: "Visual explanation" },
  { value: "FORMULA_SHORTCUT", label: "Formula / shortcut" },
  { value: "STEP_BY_STEP", label: "Step-by-step reasoning" },
  { value: "TRY_MYSELF", label: "Try again myself" },
];

export const DIFFICULTY_PREF_OPTIONS: StepOption[] = [
  { value: "START_EASY", label: "Start easy and build confidence" },
  { value: "BALANCED", label: "Balanced progression" },
  { value: "CHALLENGE_QUICKLY", label: "Challenge me quickly" },
  { value: "NOT_SURE", label: "I'm not sure" },
];

export const PAIN_POINT_OPTIONS: StepOption[] = [
  { value: "DONT_KNOW_WHERE_TO_START", label: "I don't know where to start" },
  { value: "FORGET_CONCEPTS", label: "I forget concepts" },
  { value: "CANT_SOLVE_NEW_QUESTIONS", label: "I understand examples but can't solve new questions" },
  { value: "TAKE_TOO_LONG", label: "I take too long" },
  { value: "CARELESS_MISTAKES", label: "I make careless mistakes" },
  { value: "PANIC_DURING_TESTS", label: "I panic during tests" },
  { value: "CONFUSING_QUESTIONS", label: "Questions seem confusing" },
  { value: "PRACTICE_NO_IMPROVEMENT", label: "I practice but don't improve" },
  { value: "DONT_KNOW_WEAKNESS", label: "I don't know what I'm weak at" },
  { value: "LOSE_MOTIVATION", label: "I lose motivation" },
  { value: "EVERYTHING_DIFFICULT", label: "Everything feels difficult" },
  { value: "SOMETHING_ELSE", label: "Something else" },
];

export const TARGET_SCORE_OPTIONS_UI: StepOption[] = [
  { value: "SCORE_70", label: "70%" },
  { value: "SCORE_80", label: "80%" },
  { value: "SCORE_90", label: "90%" },
  { value: "TOP_PERFORMANCE", label: "Top performance" },
  { value: "NOT_SURE", label: "Not sure" },
];

export const ONBOARDING_STEPS: StepDefinition[] = [
  {
    id: "goal",
    type: "SINGLE_SELECT",
    eyebrow: "Preparation goal",
    title: "What are you preparing for?",
    options: GOAL_OPTIONS,
    allowOther: true,
    fieldKey: "preparationGoal",
  },
  {
    id: "objective",
    type: "MULTI_SELECT_WITH_PRIMARY",
    eyebrow: "Objective",
    title: "What do you want ACEAPT to help you achieve?",
    subtitle: "Pick one primary focus. You can add more if several apply.",
    options: OBJECTIVE_OPTIONS,
    primaryFieldKey: "primaryObjective",
    secondaryFieldKey: "secondaryObjectives",
  },
  {
    id: "timeline",
    type: "SINGLE_SELECT",
    eyebrow: "Timeline",
    title: "When do you need to be ready?",
    options: TIMELINE_OPTIONS,
    allowDate: true,
    fieldKey: "timelineCategory",
  },
  {
    id: "experience",
    type: "SINGLE_SELECT",
    eyebrow: "Current experience",
    title: "How familiar are you with aptitude?",
    options: EXPERIENCE_OPTIONS,
    clarification:
      "Your answer helps us start. Your diagnostic will determine your demonstrated capability.",
    fieldKey: "experienceLevel",
  },
  {
    id: "previous-preparation",
    type: "SINGLE_SELECT",
    eyebrow: "Previous preparation",
    title: "Have you prepared for aptitude before?",
    options: PREVIOUS_PREP_OPTIONS,
    fieldKey: "previousPreparation",
  },
  {
    id: "previous-difficulties",
    type: "MULTI_SELECT",
    eyebrow: "Previous preparation",
    title: "What has been difficult for you?",
    optional: true,
    options: DIFFICULTY_AREA_OPTIONS,
    fieldKey: "previousDifficulties",
    isVisible: (ctx) => ctx.previousPreparation != null && ctx.previousPreparation !== "NEVER",
  },
  {
    id: "confidence-map",
    type: "CONFIDENCE_GRID",
    eyebrow: "Confidence map",
    title: "How confident do you feel right now?",
    subtitle: "This is how you see things today — not a measured score.",
  },
  {
    id: "daily-availability",
    type: "SINGLE_SELECT",
    eyebrow: "Daily availability",
    title: "How much time can you realistically prepare each day?",
    options: AVAILABILITY_OPTIONS,
    fieldKey: "dailyAvailability",
  },
  {
    id: "study-schedule",
    type: "SINGLE_SELECT",
    eyebrow: "Study schedule",
    title: "When do you usually prefer studying?",
    options: STUDY_TIME_OPTIONS,
    optional: true,
    fieldKey: "preferredStudyTime",
  },
  {
    id: "assistance-preference",
    type: "MULTI_SELECT",
    eyebrow: "Learning assistance",
    title: "When you're stuck, what helps you most?",
    options: ASSISTANCE_OPTIONS,
    optional: true,
    fieldKey: "preferredAssistanceModes",
  },
  {
    id: "difficulty-preference",
    type: "SINGLE_SELECT",
    eyebrow: "Difficulty preference",
    title: "How would you like ACEAPT to challenge you?",
    options: DIFFICULTY_PREF_OPTIONS,
    optional: true,
    fieldKey: "initialDifficultyPreference",
  },
  {
    id: "pain-point",
    type: "MULTI_SELECT_WITH_PRIMARY",
    eyebrow: "Pain point",
    title: "What frustrates you most about aptitude preparation?",
    subtitle: "Pick the one that hits hardest. Add more if others apply.",
    options: PAIN_POINT_OPTIONS,
    primaryFieldKey: "primaryPainPoint",
    secondaryFieldKey: "secondaryPainPoints",
  },
  {
    id: "target-score",
    type: "SINGLE_SELECT",
    eyebrow: "Target score",
    title: "Do you have a target score?",
    options: TARGET_SCORE_OPTIONS_UI,
    optional: true,
    fieldKey: "targetScore",
  },
  { id: "summary", type: "SUMMARY", eyebrow: "Your starting context", title: "Here's what I understand." },
  { id: "diagnostic-intro", type: "TRANSITION", eyebrow: "Next", title: "Let's find out where you actually are." },
];

const QUESTION_STEP_IDS = ONBOARDING_STEPS.filter((s) => s.type !== "SUMMARY" && s.type !== "TRANSITION").map(
  (s) => s.id,
);

export function getStep(id: string): StepDefinition | undefined {
  return ONBOARDING_STEPS.find((s) => s.id === id);
}

/** Steps currently relevant given what's been answered so far — this is what "adaptive
 *  questioning" (spec section 19) means in practice: the same array, filtered live. */
export function getVisibleSteps(ctx: Partial<StudentOnboardingContext>): StepDefinition[] {
  return ONBOARDING_STEPS.filter((s) => !s.isVisible || s.isVisible(ctx));
}

export function getVisibleQuestionSteps(ctx: Partial<StudentOnboardingContext>): StepDefinition[] {
  return getVisibleSteps(ctx).filter((s) => QUESTION_STEP_IDS.includes(s.id));
}

export function getNextStepId(currentStepId: string, ctx: Partial<StudentOnboardingContext>): string | null {
  const visible = getVisibleSteps(ctx);
  const idx = visible.findIndex((s) => s.id === currentStepId);
  if (idx === -1 || idx === visible.length - 1) return null;
  return visible[idx + 1]!.id;
}

export function getPreviousStepId(currentStepId: string, ctx: Partial<StudentOnboardingContext>): string | null {
  const visible = getVisibleSteps(ctx);
  const idx = visible.findIndex((s) => s.id === currentStepId);
  if (idx <= 0) return null;
  return visible[idx - 1]!.id;
}

/** "Step X of Y" — recomputed from whatever is visible right now, so it never lies when a
 *  branch appears or disappears mid-flow (spec section 20's "avoid misleading progress"). */
export function getProgress(
  currentStepId: string,
  ctx: Partial<StudentOnboardingContext>,
): { current: number; total: number } {
  const questionSteps = getVisibleQuestionSteps(ctx);
  const idx = questionSteps.findIndex((s) => s.id === currentStepId);
  return { current: idx === -1 ? 0 : idx + 1, total: questionSteps.length };
}

/** The first step the student hasn't answered yet, given their saved context — this is what
 *  "resume where you left off" (spec section 22) resolves to on return visits. */
export function getResumeStepId(ctx: StudentOnboardingContext): string {
  const visible = getVisibleSteps(ctx);
  for (const step of visible) {
    if (step.type === "SUMMARY" || step.type === "TRANSITION") return step.id;
    if (!isStepAnswered(step, ctx) && !step.optional) return step.id;
  }
  // every required step is answered — land on the first unanswered optional step, else summary
  for (const step of visible) {
    if (step.type === "SUMMARY" || step.type === "TRANSITION") return step.id;
    if (!isStepAnswered(step, ctx)) return step.id;
  }
  return "summary";
}

export function isStepAnswered(step: StepDefinition, ctx: Partial<StudentOnboardingContext>): boolean {
  switch (step.id) {
    case "goal":
      return ctx.preparationGoal != null;
    case "objective":
      return ctx.primaryObjective != null;
    case "timeline":
      return ctx.timelineCategory != null;
    case "experience":
      return ctx.experienceLevel != null;
    case "previous-preparation":
      return ctx.previousPreparation != null;
    case "previous-difficulties":
      return (ctx.previousDifficulties?.length ?? 0) > 0;
    case "confidence-map":
      return (
        ctx.selfPerceivedConfidence?.quantitative != null &&
        ctx.selfPerceivedConfidence?.logical != null &&
        ctx.selfPerceivedConfidence?.verbal != null &&
        ctx.selfPerceivedConfidence?.timePressure != null
      );
    case "daily-availability":
      return ctx.dailyAvailability != null;
    case "study-schedule":
      return ctx.preferredStudyTime != null;
    case "assistance-preference":
      return (ctx.preferredAssistanceModes?.length ?? 0) > 0;
    case "difficulty-preference":
      return ctx.initialDifficultyPreference != null;
    case "pain-point":
      return ctx.primaryPainPoint != null;
    case "target-score":
      return ctx.targetScore != null;
    default:
      return false;
  }
}

export const STEP_EVENT_MAP: Record<StepId, OnboardingEventType> = {
  goal: ONBOARDING_EVENTS.GOAL_SELECTED,
  objective: ONBOARDING_EVENTS.OBJECTIVE_SELECTED,
  timeline: ONBOARDING_EVENTS.TIMELINE_SELECTED,
  experience: ONBOARDING_EVENTS.EXPERIENCE_SELECTED,
  "previous-preparation": ONBOARDING_EVENTS.PREVIOUS_PREPARATION_SELECTED,
  "previous-difficulties": ONBOARDING_EVENTS.PREVIOUS_DIFFICULTIES_SELECTED,
  "confidence-map": ONBOARDING_EVENTS.CONFIDENCE_COMPLETED,
  "daily-availability": ONBOARDING_EVENTS.AVAILABILITY_SELECTED,
  "study-schedule": ONBOARDING_EVENTS.STUDY_SCHEDULE_SELECTED,
  "assistance-preference": ONBOARDING_EVENTS.ASSISTANCE_PREFERENCE_SELECTED,
  "difficulty-preference": ONBOARDING_EVENTS.DIFFICULTY_PREFERENCE_SELECTED,
  "pain-point": ONBOARDING_EVENTS.PAIN_POINT_SELECTED,
  "target-score": ONBOARDING_EVENTS.TARGET_SCORE_SELECTED,
};

/** The step's answer, in the exact shape its Zod schema expects — used both to seed the
 *  wizard's local draft state and, unmodified, as the PATCH payload once complete. Keeping
 *  these shapes identical (see validation.ts) means there is no separate "convert draft to
 *  payload" step to keep in sync. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initialDraftForStep(step: StepDefinition, ctx: StudentOnboardingContext): Record<string, any> {
  switch (step.id) {
    case "goal":
      return { preparationGoal: ctx.preparationGoal, preparationGoalOther: ctx.preparationGoalOther ?? "" };
    case "objective":
      return { primaryObjective: ctx.primaryObjective, secondaryObjectives: ctx.secondaryObjectives };
    case "timeline":
      return { timelineCategory: ctx.timelineCategory, targetDate: ctx.targetDate };
    case "experience":
      return { experienceLevel: ctx.experienceLevel };
    case "previous-preparation":
      return { previousPreparation: ctx.previousPreparation };
    case "previous-difficulties":
      return { previousDifficulties: ctx.previousDifficulties };
    case "confidence-map":
      return { ...ctx.selfPerceivedConfidence };
    case "daily-availability":
      return { dailyAvailability: ctx.dailyAvailability };
    case "study-schedule":
      return { preferredStudyTime: ctx.preferredStudyTime };
    case "assistance-preference":
      return { preferredAssistanceModes: ctx.preferredAssistanceModes };
    case "difficulty-preference":
      return { initialDifficultyPreference: ctx.initialDifficultyPreference };
    case "pain-point":
      return { primaryPainPoint: ctx.primaryPainPoint, secondaryPainPoints: ctx.secondaryPainPoints };
    case "target-score":
      return { targetScore: ctx.targetScore };
    default:
      return {};
  }
}

/** UI-level "is this answer complete enough to submit" check — quick and optimistic; the API
 *  route re-validates properly with Zod regardless, so this only ever gates a button, never
 *  data integrity. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isDraftComplete(stepId: string, draft: Record<string, any>): boolean {
  switch (stepId) {
    case "goal":
      return draft.preparationGoal != null && (draft.preparationGoal !== "OTHER" || !!draft.preparationGoalOther?.trim());
    case "objective":
      return draft.primaryObjective != null;
    case "timeline":
      return draft.timelineCategory != null;
    case "experience":
      return draft.experienceLevel != null;
    case "previous-preparation":
      return draft.previousPreparation != null;
    case "previous-difficulties":
      return (draft.previousDifficulties?.length ?? 0) > 0;
    case "confidence-map":
      return (
        draft.quantitative != null && draft.logical != null && draft.verbal != null && draft.timePressure != null
      );
    case "daily-availability":
      return draft.dailyAvailability != null;
    case "study-schedule":
      return draft.preferredStudyTime != null;
    case "assistance-preference":
      return (draft.preferredAssistanceModes?.length ?? 0) > 0;
    case "difficulty-preference":
      return draft.initialDifficultyPreference != null;
    case "pain-point":
      return draft.primaryPainPoint != null;
    case "target-score":
      return draft.targetScore != null;
    default:
      return false;
  }
}

// Re-exported label helpers used by summary.ts / UI so enum -> human text stays in one place.
export function labelForValue(value: string, options?: readonly StepOption[]): string {
  const found = options?.find((o) => o.value === value);
  if (found) return found.label;
  return label(value);
}

export {
  PREPARATION_GOALS,
  PRIMARY_OBJECTIVES,
  TIMELINE_CATEGORIES,
  EXPERIENCE_LEVELS,
  PREVIOUS_PREPARATION_LEVELS,
  DIFFICULTY_AREAS,
  AVAILABILITY_CATEGORIES,
  STUDY_TIMES,
  ASSISTANCE_MODES,
  DIFFICULTY_PREFERENCES,
  PAIN_POINTS,
  TARGET_SCORE_OPTIONS,
};
