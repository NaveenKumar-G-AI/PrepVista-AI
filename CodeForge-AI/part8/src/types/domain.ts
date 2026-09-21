/**
 * CodeForge Technical Interview — domain model.
 *
 * This is the single source of truth for the enums/shapes every other
 * module imports. If you already have equivalent types elsewhere in your
 * codebase (e.g. a shared `EvaluationDimension` type from an existing
 * assessment engine), prefer those and delete the duplicate here — this
 * file exists because, from this chat, we can't see what you already have.
 */

// ---------------------------------------------------------------------------
// Interview state machine (PHASE 9)
// ---------------------------------------------------------------------------

export const INTERVIEW_STATES = [
  'CREATED', 'READY', 'STARTED', 'PROBLEM_PRESENTED', 'CLARIFICATION',
  'APPROACH_DISCUSSION', 'CODING', 'TESTING', 'DEBUGGING', 'FOLLOW_UP',
  'FINAL_EVALUATION', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED',
] as const;
export type InterviewState = typeof INTERVIEW_STATES[number];

export const TERMINAL_STATES: ReadonlySet<InterviewState> = new Set([
  'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED',
]);

// ---------------------------------------------------------------------------
// Blueprints (PHASE 2 / PHASE 3)
// ---------------------------------------------------------------------------

export const INTERVIEW_TYPES = [
  'GUIDED_TECHNICAL_INTERVIEW', 'STRICT_TECHNICAL_INTERVIEW',
  'INTERVIEW_SIMULATION', 'ROLE_BASED_INTERVIEW',
  'WEAKNESS_FOCUSED_INTERVIEW', 'FINAL_READINESS_INTERVIEW', 'CUSTOM',
] as const;
export type InterviewType = typeof INTERVIEW_TYPES[number];

export const HINT_LEVELS = [
  'NONE', 'CLARIFICATION', 'CONCEPTUAL_DIRECTION', 'STRONG_DIRECTION', 'NEAR_SOLUTION',
] as const;
export type HintLevel = typeof HINT_LEVELS[number];

export interface BlueprintVersionConfig {
  competencies: string[];
  problemCount: number;
  durationMinutes: number;
  assistancePolicy: {
    maxHintLevel: HintLevel;
  };
  followUpIntensity: 'LOW' | 'MEDIUM' | 'HIGH';
  scoringDimensions: EvaluationDimension[];
  completionRules: {
    requireAllProblemsAttempted: boolean;
    requireComplexityDiscussion: boolean;
  };
}

// ---------------------------------------------------------------------------
// Evaluation (PHASE 22 / PHASE 24)
// ---------------------------------------------------------------------------

export const EVALUATION_DIMENSIONS = [
  'PROBLEM_UNDERSTANDING', 'CLARIFICATION', 'PROBLEM_DECOMPOSITION',
  'ALGORITHM_SELECTION', 'DATA_STRUCTURE_SELECTION', 'CODING_CORRECTNESS',
  'CODE_QUALITY', 'TESTING', 'DEBUGGING', 'TIME_COMPLEXITY', 'SPACE_COMPLEXITY',
  'OPTIMIZATION', 'ADAPTABILITY', 'TECHNICAL_COMMUNICATION', 'INDEPENDENCE', 'TRANSFER',
] as const;
export type EvaluationDimension = typeof EVALUATION_DIMENSIONS[number];

// INSUFFICIENT_EVIDENCE is a first-class rating, not an afterthought — see
// PHASE 52. It is only ever assigned deterministically (evaluationEngine.ts),
// never by the AI itself.
export const DIMENSION_RATINGS = [
  'STRONG', 'COMPETENT', 'DEVELOPING', 'WEAK', 'INSUFFICIENT_EVIDENCE',
] as const;
export type DimensionRating = typeof DIMENSION_RATINGS[number];

export const READINESS_LABELS = [
  'READY', 'APPROACHING_READY', 'DEVELOPING', 'NOT_READY', 'INSUFFICIENT_EVIDENCE',
] as const;
export type ReadinessLabel = typeof READINESS_LABELS[number];

// ---------------------------------------------------------------------------
// Events (PHASE 21 / PHASE 39) — kept as a TS allow-list, not a DB CHECK
// constraint, so adding a new event type never requires a migration.
// ---------------------------------------------------------------------------

export const INTERVIEW_EVENT_TYPES = [
  'INTERVIEW_CREATED', 'INTERVIEW_STARTED', 'PROBLEM_PRESENTED',
  'CLARIFICATION_REQUESTED', 'CLARIFICATION_ANSWERED', 'PROBLEM_RESTATED',
  'APPROACH_SUBMITTED', 'CODE_RUN', 'TEST_FAILED', 'TEST_PASSED',
  'DEBUGGING_STARTED', 'STUDENT_TESTED_EDGE_CASE', 'HINT_REQUESTED',
  'FOLLOWUP_ASKED', 'FOLLOWUP_ANSWERED', 'CODE_SUBMITTED',
  'INTERVIEW_SUBMITTED', 'EVALUATION_STARTED', 'EVALUATION_COMPLETED',
  'INTERVIEW_COMPLETED', 'READINESS_UPDATED', 'ROADMAP_UPDATE_TRIGGERED',
  'STUDENT_ADAPTED_TO_CONSTRAINT',
] as const;
export type InterviewEventType = typeof INTERVIEW_EVENT_TYPES[number];

export function isKnownEventType(type: string): type is InterviewEventType {
  return (INTERVIEW_EVENT_TYPES as readonly string[]).includes(type);
}

// ---------------------------------------------------------------------------
// Core entities (PHASE 2 / PHASE 38)
// ---------------------------------------------------------------------------

export interface TechnicalInterview {
  id: string;
  studentId: string;
  blueprintId: string;
  blueprintVersionId: string;
  batchId: string | null;
  /** Snapshotted at creation — a later role change must never rewrite history (PHASE 53). */
  targetRole: string;
  status: InterviewState;
  idempotencyKey: string;
  createdAt: string;
  startedAt: string | null;
  expiresAt: string | null;
  completedAt: string | null;
}

export interface InterviewProblem {
  id: string;
  interviewId: string;
  /** FK into your existing challenge bank — see src/integration/adapters.ts */
  challengeId: string;
  sequenceNumber: number;
  status: 'PENDING' | 'PRESENTED' | 'IN_PROGRESS' | 'SOLVED' | 'ABANDONED';
  selectionReason: string | null;
  presentedAt: string | null;
}

export interface InterviewEventRecord {
  id: string;
  interviewId: string;
  problemId: string | null;
  eventType: InterviewEventType | string;
  payload: Record<string, unknown>;
  createdBy: 'STUDENT' | 'SYSTEM' | 'AI' | 'INTERVIEWER';
  createdAt: string;
}
