import { IncidentState } from "./types";

/**
 * Explicit, server-enforced transition table. The frontend never decides
 * incident state — it only reflects whatever the server returns. Every
 * API route that can move an incident forward calls `transition()` and
 * persists the *returned* state; it never trusts a client-supplied state.
 */
const ALLOWED_TRANSITIONS: Record<IncidentState, IncidentState[]> = {
  CREATED: ["ACTIVE"],
  ACTIVE: ["INVESTIGATING"],
  // FIXING is reachable directly from INVESTIGATING because deploying the
  // permanent fix without a separate mitigation step first is an explicitly
  // ACCEPTABLE path (brief: "MULTIPLE VALID SOLUTIONS" / "do not create a
  // single rigid solution path"), not only reachable via MITIGATED.
  INVESTIGATING: ["MITIGATED", "FIXING", "INVESTIGATING"],
  MITIGATED: ["FIXING", "VERIFYING"],
  FIXING: ["VERIFYING"],
  VERIFYING: ["RESOLVED", "FIXING", "INVESTIGATING"],
  RESOLVED: ["POSTMORTEM"],
  POSTMORTEM: ["EVALUATED"],
  EVALUATED: [],
};

export class InvalidTransitionError extends Error {
  constructor(public from: IncidentState, public to: IncidentState) {
    super(`Invalid state transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: IncidentState, to: IncidentState): boolean {
  if (from === to) return true; // idempotent no-op is allowed, not "invalid"
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws InvalidTransitionError if the move isn't allowed; otherwise returns `to`. */
export function transition(from: IncidentState, to: IncidentState): IncidentState {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}

/**
 * Some actions imply a forward state move (e.g. a valid mitigation action
 * pushes INVESTIGATING -> MITIGATED). This resolves the *next* state given
 * the current one and an explicit target, falling back to "stay put" when
 * no move is implied. Kept separate from canTransition/transition so the
 * pure state-machine rules stay independent of action semantics.
 */
export function resolveNextState(
  current: IncidentState,
  proposed: IncidentState | undefined
): IncidentState {
  if (!proposed) return current;
  if (!canTransition(current, proposed)) return current;
  return proposed;
}

export const TERMINAL_STATES: IncidentState[] = ["EVALUATED"];

export function isTerminal(state: IncidentState): boolean {
  return TERMINAL_STATES.includes(state);
}
