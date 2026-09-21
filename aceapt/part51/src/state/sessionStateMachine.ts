import type { SessionState } from "../types/training.js";

/**
 * §95 — "Keep state machine simple and robust." COMPLETED and ABANDONED are
 * terminal: nothing transitions out of them, so a completed or abandoned
 * session can never be silently resurrected and mutated.
 */
const ALLOWED_TRANSITIONS: Record<SessionState, SessionState[]> = {
  READY: ["ACTIVE", "ABANDONED"],
  ACTIVE: ["FEEDBACK", "PAUSED", "ABANDONED", "COMPLETED"],
  FEEDBACK: ["RETRY", "ACTIVE", "VERIFICATION", "COMPLETED", "PAUSED", "ABANDONED"],
  RETRY: ["FEEDBACK", "ACTIVE", "PAUSED", "ABANDONED"],
  VERIFICATION: ["FEEDBACK", "ACTIVE", "COMPLETED", "PAUSED", "ABANDONED"],
  PAUSED: ["ACTIVE", "ABANDONED"],
  COMPLETED: [],
  ABANDONED: []
};

export function canTransition(from: SessionState, to: SessionState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidStateTransitionError extends Error {
  constructor(from: SessionState, to: SessionState) {
    super(`Invalid training-session transition: ${from} → ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

export function assertTransition(from: SessionState, to: SessionState): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}
