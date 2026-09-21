/**
 * Explicit, guarded state machines (Section 72: "Prevent invalid
 * transitions"). Kept as pure functions over string unions so they are
 * trivial to unit test and have zero dependency on how state is persisted.
 */

export type SessionStatus = 'STARTED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED' | 'TIMED_OUT';

const SESSION_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  STARTED: ['ACTIVE', 'ABANDONED', 'COMPLETED'], // COMPLETED is reachable directly, e.g. a session that only ever revealed the solution.
  ACTIVE: ['PAUSED', 'COMPLETED', 'ABANDONED', 'TIMED_OUT'],
  PAUSED: ['ACTIVE', 'ABANDONED', 'TIMED_OUT'],
  COMPLETED: [],
  ABANDONED: [],
  TIMED_OUT: ['ACTIVE'], // explicit resume/recovery path (Section 8)
};

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  if (from === to) return true; // idempotent no-op transitions are allowed (safe retries, Section 93)
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertSessionTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransitionSession(from, to)) {
    throw new InvalidTransitionError(`Cannot move a guided session from ${from} to ${to}.`);
  }
}

export type StepStatus =
  | 'PENDING'
  | 'CORRECT'
  | 'PARTIALLY_CORRECT'
  | 'INCORRECT'
  | 'FORMAT_ERROR'
  | 'UNIT_ERROR'
  | 'INCOMPLETE'
  | 'UNKNOWN'
  | 'SKIPPED';

export const TERMINAL_STEP_STATUSES: ReadonlySet<StepStatus> = new Set(['CORRECT', 'SKIPPED']);

/**
 * Section 72's concrete example: a session may not jump from step 1 pending
 * straight to step 5 complete. Advancement is always by exactly one step
 * index, unless the problem explicitly defines optional branches
 * (Section 73) - branch-aware advancement is handled one level up in
 * GuidedSolvingService, which is the only place that knows the full step
 * list; this guard just protects the primitive invariant.
 */
export function assertSequentialAdvance(currentIndex: number, nextIndex: number, stepCount: number): void {
  if (nextIndex < 0 || nextIndex > stepCount) {
    throw new InvalidTransitionError(`Step index ${nextIndex} is out of range for ${stepCount} steps.`);
  }
  if (nextIndex !== currentIndex && nextIndex !== currentIndex + 1) {
    throw new InvalidTransitionError(
      `Cannot advance from step index ${currentIndex} directly to ${nextIndex} - steps must complete in sequence.`,
    );
  }
}

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransitionError';
  }
}
