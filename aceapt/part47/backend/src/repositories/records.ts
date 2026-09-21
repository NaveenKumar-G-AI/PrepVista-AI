import type { SessionStatus, StepStatus } from '../domain/engine/stateMachine.js';
import type { AssistanceIssueType, StepResult } from '../domain/problemBank/types.js';
import type { GuidanceDependency } from '../domain/engine/fading.js';

/**
 * These five shapes are the concrete version of Section 70's
 * GuidedSession / GuidedStepState / GuidedAttempt / GuidedAssistance /
 * GuidedOutcome. See docs/schema-reference.prisma for the same shapes
 * expressed as a Postgres-ready Prisma schema for when you migrate off the
 * bundled JSON-file store.
 *
 * Deliberately absent: a duplicate Question, Skill, or Student model
 * (Section 7). `studentId` and `problemId` are plain foreign references
 * into ACEAPT's existing systems.
 */

export type SessionMode = 'GUIDED' | 'VERIFICATION';

export interface GuidedSessionRecord {
  id: string;
  studentId: string; // reference into existing ACEAPT Student system
  problemId: string; // reference into existing ACEAPT Question/Solution system
  /** Set on a VERIFICATION session created from a transfer variant (Sections 30-31). Null = the base problem's own steps. */
  variantId: string | null;
  status: SessionStatus;
  mode: SessionMode;
  currentStepIndex: number;
  version: number; // optimistic concurrency (Section 93)
  firstErrorStepId: string | null;
  solutionRevealed: boolean;
  solutionRequested: boolean;
  reconstructionSuccess: boolean | null;
  parentSessionId: string | null; // set on a VERIFICATION session, points back at its GUIDED parent
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
}

export interface GuidedStepStateRecord {
  id: string;
  sessionId: string;
  stepId: string;
  sequence: number;
  status: StepStatus;
  helpLevel: number;
  consecutiveFailures: number;
  skipped: boolean;
  /** Flips to false the moment ANY hint/explanation/next-step/solution reveal touches this step. */
  independent: boolean;
  recoveredWithGuidance: boolean;
  startedAt: string;
  completedAt: string | null;
}

export interface GuidedAttemptRecord {
  id: string;
  sessionId: string;
  stepStateId: string;
  stepId: string;
  attemptNumber: number;
  rawInput: string;
  result: StepResult;
  numericValue: number | null;
  structuredValues: Record<string, number> | null;
  detail: string | null;
  /** Time since this step was first shown to the student (Section 43's raw signal - see README for scope note). */
  elapsedMs: number | null;
  /** Optional client-supplied idempotency key so a network retry of the same submission is a safe no-op (Section 93, 107). */
  clientRequestId: string | null;
  createdAt: string;
}

export type AssistanceType = 'HINT' | 'EXPLANATION' | 'NEXT_STEP' | 'FULL_SOLUTION' | 'AUTO_ESCALATION';
export type AssistanceSource = 'AI' | 'DETERMINISTIC_FALLBACK' | 'TEMPLATE';

export interface GuidedAssistanceRecord {
  id: string;
  sessionId: string;
  stepId: string | null;
  type: AssistanceType;
  helpLevel: number;
  assistanceIssueType: AssistanceIssueType | null;
  source: AssistanceSource;
  message: string;
  createdAt: string;
}

export interface GuidedOutcomeRecord {
  id: string;
  sessionId: string;
  studentId: string;
  problemId: string;
  stepsTotal: number;
  stepsIndependent: number;
  stepsAssisted: number;
  hintsUsed: number;
  retries: number;
  firstErrorStepId: string | null;
  recoverySuccess: boolean;
  solutionRequested: boolean;
  reconstructionSuccess: boolean | null;
  verificationSessionId: string | null;
  verificationSuccess: boolean | null;
  transferSuccess: boolean | null;
  guidanceDependency: GuidanceDependency;
  studentFeedback: string | null;
  createdAt: string;
}
