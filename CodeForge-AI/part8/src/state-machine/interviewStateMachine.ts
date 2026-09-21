import { InterviewState, TERMINAL_STATES, INTERVIEW_STATES } from '../types/domain';

export class InvalidTransitionError extends Error {
  constructor(public readonly from: InterviewState, public readonly to: InterviewState) {
    super(`Invalid interview state transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export type TransitionGraph = Record<InterviewState, InterviewState[]>;

/**
 * Default flow from PHASE 9, plus:
 *  - the DEBUGGING <-> TESTING loop the spec calls out explicitly
 *  - FOLLOW_UP -> CODING, since PHASE 17 (adaptability) has the interviewer
 *    change a constraint mid-follow-up, which can send the student back to
 *    the editor
 *  - CANCELLED / EXPIRED / FAILED reachable from every non-terminal state
 *
 * Blueprint versions may override this entirely via
 * blueprint_version.state_machine_definition (PHASE 9: "the exact flow must
 * remain configurable") — see parseTransitionGraph below.
 */
export const DEFAULT_TRANSITIONS: TransitionGraph = {
  CREATED: ['READY', 'CANCELLED', 'EXPIRED'],
  READY: ['STARTED', 'CANCELLED', 'EXPIRED'],
  STARTED: ['PROBLEM_PRESENTED', 'CANCELLED', 'EXPIRED', 'FAILED'],
  PROBLEM_PRESENTED: ['CLARIFICATION', 'APPROACH_DISCUSSION', 'CANCELLED', 'EXPIRED', 'FAILED'],
  CLARIFICATION: ['APPROACH_DISCUSSION', 'CANCELLED', 'EXPIRED', 'FAILED'],
  APPROACH_DISCUSSION: ['CODING', 'CANCELLED', 'EXPIRED', 'FAILED'],
  CODING: ['TESTING', 'CANCELLED', 'EXPIRED', 'FAILED'],
  TESTING: ['DEBUGGING', 'FOLLOW_UP', 'CANCELLED', 'EXPIRED', 'FAILED'],
  DEBUGGING: ['TESTING', 'CANCELLED', 'EXPIRED', 'FAILED'],
  FOLLOW_UP: ['FINAL_EVALUATION', 'CODING', 'CANCELLED', 'EXPIRED', 'FAILED'],
  FINAL_EVALUATION: ['COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'],
  COMPLETED: [],
  EXPIRED: [],
  CANCELLED: [],
  FAILED: [],
};

export function canTransition(
  from: InterviewState,
  to: InterviewState,
  graph: TransitionGraph = DEFAULT_TRANSITIONS,
): boolean {
  if (TERMINAL_STATES.has(from)) return false;
  return graph[from]?.includes(to) ?? false;
}

/** Throws InvalidTransitionError rather than silently clamping — the caller
 *  (interviewSessionService) is responsible for turning that into an
 *  INVALID_STATE API error (PHASE 46). */
export function transition(
  from: InterviewState,
  to: InterviewState,
  graph: TransitionGraph = DEFAULT_TRANSITIONS,
): InterviewState {
  if (!canTransition(from, to, graph)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}

/** Validates a blueprint-supplied override graph before trusting it. Falls
 *  back to DEFAULT_TRANSITIONS on anything malformed rather than letting a
 *  bad blueprint config open up invalid transitions. */
export function parseTransitionGraph(raw: unknown): TransitionGraph {
  if (!raw || typeof raw !== 'object') return DEFAULT_TRANSITIONS;
  const candidate = raw as Record<string, unknown>;
  const knownStates = INTERVIEW_STATES as readonly string[];
  for (const [key, value] of Object.entries(candidate)) {
    if (!knownStates.includes(key)) return DEFAULT_TRANSITIONS;
    if (!Array.isArray(value) || !value.every(v => typeof v === 'string' && knownStates.includes(v))) {
      return DEFAULT_TRANSITIONS;
    }
  }
  return candidate as TransitionGraph;
}
