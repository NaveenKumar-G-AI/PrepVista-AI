/**
 * Enumerations for Feature 5 — Adaptive Practice & Dynamic Challenge Engine.
 *
 * These map directly to the taxonomies in the master implementation prompt
 * (practice objectives §7, practice modes §8, difficulty §9, error
 * categories §11, confidence §14, question types §16, mastery §24-25,
 * question health §35). Kept centralized so every engine speaks the same
 * vocabulary.
 */

export enum PracticeObjective {
  BUILD_FOUNDATION = "BUILD_FOUNDATION",
  REPAIR_GAP = "REPAIR_GAP",
  IMPROVE_ACCURACY = "IMPROVE_ACCURACY",
  IMPROVE_SPEED = "IMPROVE_SPEED",
  VERIFY_MASTERY = "VERIFY_MASTERY",
  TRANSFER_SKILL = "TRANSFER_SKILL",
  PREPARE_FOR_EXAM = "PREPARE_FOR_EXAM",
  MAINTAIN_SKILL = "MAINTAIN_SKILL",
}

export enum PracticeMode {
  LEARN_AND_PRACTICE = "LEARN_AND_PRACTICE",
  WEAKNESS_REPAIR = "WEAKNESS_REPAIR",
  MASTERY_BUILDER = "MASTERY_BUILDER",
  SPEED_BUILDER = "SPEED_BUILDER",
  ACCURACY_BUILDER = "ACCURACY_BUILDER",
  MIXED_PRACTICE = "MIXED_PRACTICE",
  CHALLENGE_MODE = "CHALLENGE_MODE",
  EXAM_MODE = "EXAM_MODE",
}

/**
 * Ordinal difficulty ladder (§9). Ordinal value is what the adaptive engine
 * steps up/down — never collapse this back to Easy/Medium/Hard in code that
 * consumes it.
 */
export enum Difficulty {
  FOUNDATION = 0,
  EASY = 1,
  EASY_PLUS = 2,
  MEDIUM = 3,
  MEDIUM_PLUS = 4,
  HARD = 5,
  HARD_PLUS = 6,
  EXPERT = 7,
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  [Difficulty.FOUNDATION]: "Foundation",
  [Difficulty.EASY]: "Easy",
  [Difficulty.EASY_PLUS]: "Easy+",
  [Difficulty.MEDIUM]: "Medium",
  [Difficulty.MEDIUM_PLUS]: "Medium+",
  [Difficulty.HARD]: "Hard",
  [Difficulty.HARD_PLUS]: "Hard+",
  [Difficulty.EXPERT]: "Expert",
};

/** The dimension a difficulty adjustment or question-selection pass should bias toward (§9, §10). */
export enum DifficultyDimension {
  CONCEPT = "CONCEPT",
  REASONING = "REASONING",
  CALCULATION = "CALCULATION",
  TIME_PRESSURE = "TIME_PRESSURE",
  DISTRACTOR = "DISTRACTOR",
  TRANSFER = "TRANSFER",
}

export enum ErrorCategory {
  CONCEPT_GAP = "CONCEPT_GAP",
  PROCEDURAL_ERROR = "PROCEDURAL_ERROR",
  CALCULATION_ERROR = "CALCULATION_ERROR",
  LOGICAL_ERROR = "LOGICAL_ERROR",
  MISREAD = "MISREAD",
  CARELESS_ERROR = "CARELESS_ERROR",
  TIME_PRESSURE = "TIME_PRESSURE",
  GUESS = "GUESS",
  PARTIAL_UNDERSTANDING = "PARTIAL_UNDERSTANDING",
  UNKNOWN = "UNKNOWN",
}

export enum ConfidenceLevel {
  VERY_UNSURE = 1,
  UNSURE = 2,
  NEUTRAL = 3,
  CONFIDENT = 4,
  VERY_CONFIDENT = 5,
}

export enum ConfidenceCalibration {
  OVERCONFIDENT = "OVERCONFIDENT",
  UNDERCONFIDENT = "UNDERCONFIDENT",
  CALIBRATED = "CALIBRATED",
  UNKNOWN = "UNKNOWN",
}

export enum QuestionType {
  CONCEPT_CHECK = "CONCEPT_CHECK",
  GUIDED_PRACTICE = "GUIDED_PRACTICE",
  STANDARD_PRACTICE = "STANDARD_PRACTICE",
  APPLICATION = "APPLICATION",
  TRANSFER = "TRANSFER",
  MIXED = "MIXED",
  CHALLENGE = "CHALLENGE",
  SPEED = "SPEED",
  ACCURACY = "ACCURACY",
  EXAM_STYLE = "EXAM_STYLE",
}

export enum RelativeSpeed {
  FAST = "FAST",
  ON_PACE = "ON_PACE",
  SLOW = "SLOW",
}

export enum PerformanceInterpretation {
  ACCURATE_FAST = "ACCURATE_FAST",
  ACCURATE_SLOW = "ACCURATE_SLOW",
  FAST_INACCURATE = "FAST_INACCURATE",
  SLOW_INACCURATE = "SLOW_INACCURATE",
}

export enum MasteryState {
  NOT_STARTED = "NOT_STARTED",
  DEVELOPING = "DEVELOPING",
  APPROACHING_MASTERY = "APPROACHING_MASTERY",
  VERIFIED_MASTERY = "VERIFIED_MASTERY",
  MASTERY_NOT_STABLE = "MASTERY_NOT_STABLE",
  FORGOTTEN = "FORGOTTEN",
}

export enum QuestionHealth {
  HEALTHY = "HEALTHY",
  REVIEW_REQUIRED = "REVIEW_REQUIRED",
  AMBIGUOUS = "AMBIGUOUS",
  LOW_VALUE = "LOW_VALUE",
  TOO_EASY = "TOO_EASY",
  TOO_HARD = "TOO_HARD",
  ANSWER_ISSUE = "ANSWER_ISSUE",
  EXPLANATION_ISSUE = "EXPLANATION_ISSUE",
  RETIRED = "RETIRED",
}

export enum RetryType {
  RETRY_SAME = "RETRY_SAME",
  RETRY_WITH_HINT = "RETRY_WITH_HINT",
  SIMILAR_QUESTION = "SIMILAR_QUESTION",
  EASIER_REMEDIATION = "EASIER_REMEDIATION",
  REATTEMPT_AFTER_EXPLANATION = "REATTEMPT_AFTER_EXPLANATION",
}

export enum SessionStatus {
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  ABANDONED = "ABANDONED",
}

export enum QuestionSource {
  SEED = "SEED",
  TEMPLATE_GENERATED = "TEMPLATE_GENERATED",
  AI_GENERATED = "AI_GENERATED",
}

export enum TimeMode {
  UNTIMED = "UNTIMED",
  SOFT_LIMIT = "SOFT_LIMIT",
  MODERATE_LIMIT = "MODERATE_LIMIT",
  COMPETITIVE_LIMIT = "COMPETITIVE_LIMIT",
  EXAM_PRESSURE = "EXAM_PRESSURE",
}

export enum Role {
  STUDENT = "STUDENT",
  TPO_ADMIN = "TPO_ADMIN",
}
