import type { SessionState, SupportedLanguage, DebuggingSession } from "../types.js";
import { InvalidStateTransitionError } from "../types.js";

export type SessionEvent =
  | "START"
  | "REPRODUCE_FAILURE"
  | "IDENTIFY_ROOT_CAUSE"
  | "ATTEMPT_FIX"
  | "VERIFY_SUCCESS"
  | "VERIFY_FAILURE"
  | "ABANDON";

/**
 * Explicit allow-list of transitions. Anything not listed here is invalid -
 * this is the single source of truth for what a session is allowed to do
 * next, rather than scattering `if` statements about session state across
 * the API layer.
 */
const TRANSITIONS: Record<SessionState, Partial<Record<SessionEvent, SessionState>>> = {
  NOT_STARTED: { START: "IN_PROGRESS" },
  IN_PROGRESS: {
    REPRODUCE_FAILURE: "IN_PROGRESS", // reproducing doesn't change state, but is a valid no-op event
    IDENTIFY_ROOT_CAUSE: "ROOT_CAUSE_IDENTIFIED",
    ABANDON: "ABANDONED"
  },
  ROOT_CAUSE_IDENTIFIED: {
    ATTEMPT_FIX: "FIX_ATTEMPTED",
    ABANDON: "ABANDONED"
  },
  FIX_ATTEMPTED: {
    VERIFY_SUCCESS: "RESOLVED",
    VERIFY_FAILURE: "FAILED",
    ATTEMPT_FIX: "FIX_ATTEMPTED", // another fix attempt after a failed verification
    ABANDON: "ABANDONED"
  },
  RESOLVED: {},
  FAILED: {
    ATTEMPT_FIX: "FIX_ATTEMPTED", // student can keep trying after a failed fix
    ABANDON: "ABANDONED"
  },
  ABANDONED: {}
};

export function canTransition(from: SessionState, event: SessionEvent): boolean {
  return TRANSITIONS[from]?.[event] !== undefined;
}

export function nextState(from: SessionState, event: SessionEvent): SessionState {
  const to = TRANSITIONS[from]?.[event];
  if (!to) throw new InvalidStateTransitionError(from, event);
  return to;
}

export function createSession(args: {
  id: string;
  userId: string;
  challengeId: string;
  submissionId: string | null;
  language: SupportedLanguage;
  startingCode: string;
}): DebuggingSession {
  return {
    id: args.id,
    userId: args.userId,
    challengeId: args.challengeId,
    submissionId: args.submissionId,
    language: args.language,
    state: "NOT_STARTED",
    startedAt: new Date().toISOString(),
    endedAt: null,
    currentCode: args.startingCode
  };
}

export function applyEvent(session: DebuggingSession, event: SessionEvent): DebuggingSession {
  const to = nextState(session.state, event);
  const isTerminal = to === "RESOLVED" || to === "FAILED" || to === "ABANDONED";
  return {
    ...session,
    state: to,
    endedAt: isTerminal ? new Date().toISOString() : session.endedAt
  };
}

export const TERMINAL_STATES: ReadonlySet<SessionState> = new Set(["RESOLVED", "FAILED", "ABANDONED"]);
