// ============================================================================
// Phase 34-36 — deterministic interview session state machine.
//
// Pure functions only: no I/O, no side effects beyond the immutable session
// object returned. This is what makes it exhaustively unit-testable, and why
// it is the one piece of this feature that can be tested with total
// confidence rather than "as good as the fakes we could build."
// ============================================================================

import type { InterviewSession, SessionState } from "./types.js";

/**
 * Explicit, closed transition table. If a (from, to) pair is not listed here,
 * it is illegal — there is no fallback interpretation. This directly
 * satisfies "do not create ambiguous state transitions."
 */
export const TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  CREATED: ["READY", "CANCELLED"],
  READY: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PAUSED", "EVALUATION_PENDING", "COMPLETED", "CANCELLED"],
  PAUSED: ["RESUMED", "CANCELLED"],
  RESUMED: ["IN_PROGRESS", "CANCELLED"],
  EVALUATION_PENDING: ["COMPLETED", "EVALUATION_FAILED", "CANCELLED"],
  EVALUATION_FAILED: ["EVALUATION_PENDING", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const TERMINAL_STATES: readonly SessionState[] = ["COMPLETED", "CANCELLED"];

export function isTerminal(state: SessionState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function canTransition(from: SessionState, to: SessionState): boolean {
  return TRANSITIONS[from].includes(to);
}

export type TransitionResult =
  | { ok: true; session: InterviewSession }
  | { ok: false; error: string; from: SessionState; attempted: SessionState };

export interface TransitionOptions {
  now?: () => string;
  cancelReason?: string;
}

/**
 * Applies a state transition, stamping the relevant timestamp field.
 * Returns a Result rather than throwing so callers (API handlers, workers,
 * tests) can handle illegal transitions as ordinary data, not exceptions.
 */
export function applyTransition(
  session: InterviewSession,
  to: SessionState,
  options: TransitionOptions = {},
): TransitionResult {
  const now = options.now ?? (() => new Date().toISOString());

  if (isTerminal(session.state)) {
    return {
      ok: false,
      error: `Session ${session.id} is in terminal state ${session.state}; no further transitions are allowed.`,
      from: session.state,
      attempted: to,
    };
  }

  if (!canTransition(session.state, to)) {
    return {
      ok: false,
      error: `Illegal transition: ${session.state} -> ${to}. Allowed: [${TRANSITIONS[session.state].join(", ")}]`,
      from: session.state,
      attempted: to,
    };
  }

  const timestamp = now();
  const next: InterviewSession = { ...session, state: to };

  switch (to) {
    case "IN_PROGRESS":
      if (!next.startedAt) next.startedAt = timestamp;
      break;
    case "PAUSED":
      next.pausedAt = timestamp;
      break;
    case "RESUMED":
      next.resumedAt = timestamp;
      break;
    case "COMPLETED":
      next.completedAt = timestamp;
      break;
    case "CANCELLED":
      next.cancelledAt = timestamp;
      next.cancelReason = options.cancelReason ?? next.cancelReason;
      break;
    default:
      break;
  }

  return { ok: true, session: next };
}

/**
 * Phase 35 — session recovery. Resuming after a dropped connection must land
 * back on IN_PROGRESS with all prior responses intact; it must never re-enter
 * READY/CREATED (which would imply the session could be re-initialized) and
 * must never silently invent a PAUSED state that was never actually recorded.
 */
export function recoverSession(session: InterviewSession, options: TransitionOptions = {}): TransitionResult {
  if (session.state === "IN_PROGRESS" || session.state === "PAUSED") {
    // Already resumable / mid-flight — recovery is a no-op that just
    // confirms the session is safe to continue from where responses left off.
    return { ok: true, session };
  }
  if (session.state === "RESUMED") {
    return applyTransition(session, "IN_PROGRESS", options);
  }
  return {
    ok: false,
    error: `Session ${session.id} is in state ${session.state} and is not recoverable into an active interview.`,
    from: session.state,
    attempted: "IN_PROGRESS",
  };
}
