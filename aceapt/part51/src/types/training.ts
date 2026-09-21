import type { ErrorType, InterventionType, RecurrenceStatus } from "./errorTaxonomy.js";

/** §31 — the nine precision training modes, plus §47 mixed mode. */
export const TRAINING_TYPES = [
  "FOUNDATION_PRECISION",
  "STRATEGY_PRECISION",
  "FORMULA_PRECISION",
  "CALCULATION_PRECISION",
  "INTERPRETATION_PRECISION",
  "LOGIC_PRECISION",
  "VERIFICATION_PRECISION",
  "PRESSURE_PRECISION",
  "TRANSFER_PRECISION",
  "MIXED_PRECISION"
] as const;
export type TrainingType = (typeof TRAINING_TYPES)[number];

/** §95 — session state machine. */
export const SESSION_STATES = [
  "READY",
  "ACTIVE",
  "FEEDBACK",
  "RETRY",
  "VERIFICATION",
  "COMPLETED",
  "PAUSED",
  "ABANDONED"
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export type Difficulty = "easy" | "medium" | "hard";
export type HintLevel = "independent" | "guided" | "hint_used";

/**
 * What the caller (assessment/session orchestration layer, or a directly
 * wired F45/47/48/49/50 integration) attaches to an attempt at submit time.
 * This is the seam described in the pre-coding report: rather than Feature 51
 * reaching out synchronously to five other features on every submission, the
 * fields those features own are captured once, here, at the point the
 * attempt is recorded — exactly the shape a real integration would produce.
 */
export interface AttemptSubmission {
  questionId: string;
  skillId: string;
  submittedAnswer?: unknown;
  isCorrect: boolean;
  errorType?: ErrorType | null;
  difficulty: Difficulty;
  isNovel?: boolean; // F49 Anti-Memorization
  hintLevel?: HintLevel; // F48 Hint Intelligence
  responseTimeMs?: number | null; // F50 Speed Training
  expectedTimeMs?: number | null;
  selfCorrected?: boolean;
  questionValid?: boolean; // F53/54 Question Quality/Validation
  stepResults?: Array<{ step: number; correct: boolean }> | null; // F47 Guided Solving
}

export interface StartTrainingRequest {
  trainingType: TrainingType;
  targetSkillId?: string | null;
  targetErrorType?: ErrorType | null;
  difficulty?: Difficulty;
  mode?: "guided" | "independent";
  questionPlan: string[]; // question ids, pre-selected by the caller's question bank
}

export interface InterventionRecord {
  id: string;
  studentId: string;
  sessionId: string | null;
  errorType: ErrorType;
  skillId: string | null;
  interventionType: InterventionType;
  reason: string;
  recurrenceStatus: RecurrenceStatus;
  evidence: Record<string, unknown>;
  createdAt: string;
}
