import { LIFECYCLE_RANK } from "../types/enums.js";
import type { EvaluationLifecycleState } from "../types/enums.js";
import type { LifecycleEvent as LifecycleEventType } from "../types/normalized.js";

export interface EvaluationTrackedState {
  evaluationId: string;
  submissionId: string;
  currentState: EvaluationLifecycleState;
  lastSequence: number | null;
  updatedAtIso: string;
  isFinalized: boolean;
}

export type EventGuardDecision =
  | { accept: true; nextState: EvaluationLifecycleState }
  | { accept: false; reasonCode: "STALE_RANK" | "STALE_SEQUENCE" | "DUPLICATE" | "ALREADY_FINALIZED"; detail: string };

/**
 * Idempotent, out-of-order-safe guard for evaluation lifecycle events.
 *
 * Rules enforced:
 *  - A finalized (COMPLETED) evaluation never moves backwards or is
 *    re-opened by a later-arriving stale event.
 *  - Events are compared both by lifecycle rank (SUBMITTED < QUEUED < ... < COMPLETED)
 *    and by source sequence number (when the source system provides one),
 *    so a delayed RUNNING event arriving after COMPLETED is rejected.
 *  - The exact same event (same evaluationId + state + sequence) applied
 *    twice is a no-op, not an error and not a duplicate state transition.
 */
export function evaluateLifecycleTransition(
  tracked: EvaluationTrackedState | null,
  event: LifecycleEventType,
): EventGuardDecision {
  if (tracked === null) {
    // First event ever seen for this evaluation.
    return { accept: true, nextState: event.state };
  }

  if (tracked.isFinalized) {
    return {
      accept: false,
      reasonCode: "ALREADY_FINALIZED",
      detail: `Evaluation ${event.evaluationId} is already finalized (COMPLETED); no further transitions are accepted.`,
    };
  }

  const currentRank = LIFECYCLE_RANK[tracked.currentState];
  const incomingRank = LIFECYCLE_RANK[event.state];

  // Exact duplicate (same state, same or missing sequence) — idempotent no-op.
  if (
    event.state === tracked.currentState &&
    (event.sequence === null || event.sequence === tracked.lastSequence)
  ) {
    return {
      accept: false,
      reasonCode: "DUPLICATE",
      detail: `Duplicate lifecycle event for evaluation ${event.evaluationId} at state ${event.state} ignored.`,
    };
  }

  // Sequence-based staleness check, when both events carry a sequence number.
  if (event.sequence !== null && tracked.lastSequence !== null && event.sequence < tracked.lastSequence) {
    return {
      accept: false,
      reasonCode: "STALE_SEQUENCE",
      detail: `Event sequence ${event.sequence} is older than last-seen sequence ${tracked.lastSequence} for evaluation ${event.evaluationId}.`,
    };
  }

  // Rank-based staleness check — never move the state machine backwards.
  if (incomingRank < currentRank) {
    return {
      accept: false,
      reasonCode: "STALE_RANK",
      detail: `Event state ${event.state} (rank ${incomingRank}) is behind current state ${tracked.currentState} (rank ${currentRank}) for evaluation ${event.evaluationId}.`,
    };
  }

  return { accept: true, nextState: event.state };
}

export function applyLifecycleEvent(
  tracked: EvaluationTrackedState | null,
  event: LifecycleEventType,
): { state: EvaluationTrackedState; decision: EventGuardDecision } {
  const decision = evaluateLifecycleTransition(tracked, event);

  if (!decision.accept) {
    const fallback: EvaluationTrackedState = tracked ?? {
      evaluationId: event.evaluationId,
      submissionId: event.submissionId,
      currentState: event.state,
      lastSequence: event.sequence,
      updatedAtIso: event.emittedAtIso,
      isFinalized: event.state === "COMPLETED",
    };
    return { state: fallback, decision };
  }

  const nextState: EvaluationTrackedState = {
    evaluationId: event.evaluationId,
    submissionId: event.submissionId,
    currentState: decision.nextState,
    lastSequence: event.sequence ?? tracked?.lastSequence ?? null,
    updatedAtIso: event.emittedAtIso,
    isFinalized: decision.nextState === "COMPLETED",
  };
  return { state: nextState, decision };
}
