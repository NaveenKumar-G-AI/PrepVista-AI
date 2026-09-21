// Shared domain types. These mirror the Postgres enums in sql/schema.sql -
// keep the two in sync if either changes.

export type NoveltyLevel = "FAMILIAR" | "SLIGHTLY_VARIANT" | "NOVEL" | "COMPLEX_APPLICATION";
export const NOVELTY_ORDER: NoveltyLevel[] = ["FAMILIAR", "SLIGHTLY_VARIANT", "NOVEL", "COMPLEX_APPLICATION"];

export type ContextType = "LABELED" | "MIXED_CONTEXT" | "REAL_WORLD";

export type QuestionQualityStatus = "PENDING" | "APPROVED" | "REJECTED";
export type QuestionSource = "SEED" | "AI";

export type ExposureState = "SEEN" | "PRACTICED" | "VERIFIED" | "REPEATED" | "MEMORIZATION_RISK" | "RETIRED";

export type EvidenceType = "PRACTICE" | "ASSESSMENT" | "VARIATION" | "TRANSFER" | "DELAYED" | "MIXED_CONTEXT";

export type MasteryStateEnum =
  | "UNKNOWN"
  | "INTRODUCED"
  | "LEARNING"
  | "PRACTICING"
  | "IMPROVING"
  | "PROVISIONALLY_MASTERED"
  | "VERIFIED_MASTERED"
  | "STABLE_MASTERED"
  | "AT_RISK"
  | "REGRESSED";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export type VerificationObjective =
  | "PROVISIONAL_CHECK"
  | "VERIFY_TRANSFER"
  | "STABILITY_CHECK"
  | "MAINTENANCE_CHECK"
  | "DELAYED_VERIFICATION"
  | "RECOVERY_CHECK";

export type AttemptStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "TECHNICAL_FAILURE";
export type AttemptResult = "MASTERY_VERIFIED" | "NOT_STABLE_YET";

export interface Student {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

export interface Skill {
  id: string;
  key: string;
  name: string;
  category: string;
  importance: number;
  createdAt: string;
}

export interface QuestionChoice {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  skillId: string;
  formGroupId: string;
  prompt: string;
  choices: QuestionChoice[];
  correctAnswer: string;
  explanation: string;
  difficulty: number;
  noveltyLevel: NoveltyLevel;
  contextType: ContextType;
  expectedTimeSeconds: number;
  generatedBy: QuestionSource;
  qualityStatus: QuestionQualityStatus;
  qualityChecks: Record<string, unknown> | null;
  createdAt: string;
}

export interface QuestionExposure {
  id: string;
  studentId: string;
  questionId: string;
  state: ExposureState;
  seenCount: number;
  lastSeenAt: string;
  lastWasCorrect: boolean | null;
}

export interface MasteryEvidence {
  id: string;
  studentId: string;
  skillId: string;
  questionId: string | null;
  evidenceType: EvidenceType;
  score: number;
  difficulty: number;
  timed: boolean;
  timeTakenSeconds: number | null;
  expectedTimeSeconds: number | null;
  contextType: ContextType;
  noveltyLevel: NoveltyLevel;
  questionExposureState: ExposureState | null;
  source: string;
  verificationAttemptId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface DimensionScores {
  conceptScore: number | null;
  executionScore: number | null;
  transferScore: number | null;
  retentionScore: number | null;
  timedScore: number | null;
  consistencyScore: number | null;
}

export interface MasteryState extends DimensionScores {
  id: string;
  studentId: string;
  skillId: string;
  state: MasteryStateEnum;
  confidence: ConfidenceLevel;
  verifiedSnapshot: Record<string, unknown> | null;
  lastVerifiedAt: string | null;
  nextReviewAt: string | null;
  masteryModelVersion: string;
  updatedAt: string;
}

export interface VerificationAttempt {
  id: string;
  studentId: string;
  skillId: string;
  objective: VerificationObjective;
  status: AttemptStatus;
  result: AttemptResult | null;
  questionPlan: VerificationQuestionPlanItem[];
  currentIndex: number;
  evidenceSummary: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
}

export interface VerificationQuestionPlanItem {
  questionId: string;
  noveltyLevel: NoveltyLevel;
  contextType: ContextType;
  timed: boolean;
  expectedTimeSeconds: number;
  /** Populated once answered */
  answeredAt?: string;
  studentAnswer?: string;
  correct?: boolean;
  timeTakenSeconds?: number;
}

export interface ReviewScheduleItem {
  id: string;
  studentId: string;
  skillId: string;
  priorityScore: number;
  reason: string;
  dueAt: string;
  estimatedMinutes: number;
  status: string;
  updatedAt: string;
}

export interface MasteryHistoryEvent {
  id: string;
  studentId: string;
  skillId: string;
  eventType: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface StructuredSignal {
  studentId: string;
  skillId: string;
  signal: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  evidence: Record<string, unknown>;
}
