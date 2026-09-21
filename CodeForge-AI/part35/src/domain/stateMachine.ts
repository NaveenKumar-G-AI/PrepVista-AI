import type { SessionState } from "./types.js";

/**
 * §37 — explicit state transitions, no ambiguous states.
 * Keys are the *current* state; values are the states it may legally move to.
 */
export const ALLOWED_TRANSITIONS: Record<SessionState, SessionState[]> = {
  CREATED: ["READY", "CANCELLED"],
  READY: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PAUSED", "EVALUATION_PENDING", "COMPLETED", "CANCELLED"],
  PAUSED: ["RESUMED", "CANCELLED"],
  RESUMED: ["IN_PROGRESS", "PAUSED", "CANCELLED"],
  EVALUATION_PENDING: ["IN_PROGRESS", "EVALUATION_FAILED", "COMPLETED"],
  EVALUATION_FAILED: ["EVALUATION_PENDING", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export class IllegalStateTransitionError extends Error {
  constructor(public readonly from: SessionState, public readonly to: SessionState) {
    super(`Illegal session transition: ${from} -> ${to}`);
    this.name = "IllegalStateTransitionError";
  }
}

export function assertValidTransition(from: SessionState, to: SessionState): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new IllegalStateTransitionError(from, to);
  }
}

export function isTerminal(state: SessionState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}

/** §38 session recovery — a session is resumable if it's sitting in a state that implies "waiting on the candidate or a retry", not a terminal or actively-processing state. */
export function isRecoverable(state: SessionState): boolean {
  return state === "PAUSED" || state === "IN_PROGRESS" || state === "EVALUATION_FAILED";
}
