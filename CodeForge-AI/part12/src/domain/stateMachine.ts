/**
 * CodeForge AI — Submission System
 * The submission state machine. This is the single source of truth for "what
 * transitions are legal" — db/migrations/0002_functions.sql enforces the same rules at
 * the database layer (defense in depth), and every place in this codebase that changes
 * a submission's status calls assertTransition() first instead of setting status
 * directly, so this table is the only place the rules live.
 *
 * Design note — DRAFT and SUBMITTED/VALIDATING/QUEUED:
 * DRAFT represents the editable workspace and is NEVER a persisted submission row (see
 * "Workspace vs Submission" in the spec) — it exists in the enum for schema completeness
 * only and has no outgoing transitions here. SUBMITTED -> VALIDATING -> QUEUED are real,
 * legal, and enforced here, even though src/services/submissionService.ts happens to
 * walk through all three synchronously within one request (deep validation runs before
 * a row exists at all) — a future async validation step (e.g. plagiarism prescreen)
 * could legitimately make VALIDATING durable without changing this table at all.
 */

import type { SubmissionStatus } from './enums.js';

export const TRANSITIONS: Readonly<Record<SubmissionStatus, readonly SubmissionStatus[]>> = Object.freeze({
  DRAFT: [], // never a submission-row status; see file header
  SUBMITTED: ['VALIDATING', 'FAILED'],
  VALIDATING: ['QUEUED', 'FAILED'],
  QUEUED: ['COMPILING', 'CANCELLED', 'JUDGE_ERROR', 'EXPIRED'],
  COMPILING: ['RUNNING', 'COMPLETED', 'CANCELLED', 'JUDGE_ERROR', 'EXPIRED'], // COMPLETED here = COMPILATION_ERROR verdict
  RUNNING: ['EVALUATING', 'CANCELLED', 'JUDGE_ERROR', 'EXPIRED'],
  EVALUATING: ['COMPLETED', 'CANCELLED', 'JUDGE_ERROR', 'EXPIRED'],
  COMPLETED: [], // terminal — re-evaluation creates a NEW evaluation_result, never reopens this
  FAILED: [], // terminal — request-validation rejection, distinct from a judged verdict
  CANCELLED: [], // terminal
  EXPIRED: [], // terminal
  JUDGE_ERROR: [], // terminal — but see re-evaluation, which is a *new* job/result, not a reopen
});

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: SubmissionStatus,
    public readonly to: SubmissionStatus,
  ) {
    super(`Invalid submission state transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws InvalidTransitionError if the transition isn't legal. Never mutates anything. */
export function assertTransition(from: SubmissionStatus, to: SubmissionStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isTerminal(status: SubmissionStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * A student's own client is only ever allowed to *observe* status — this function is
 * the explicit codification of "never allow arbitrary client-controlled status
 * updates." There is no code path anywhere in this system that lets a client-supplied
 * status reach assertTransition with client identity as the actor; this function
 * exists so that guarantee is checkable in one place instead of implied by omission.
 */
export function clientMayDirectlySet(_status: SubmissionStatus): false {
  return false;
}
