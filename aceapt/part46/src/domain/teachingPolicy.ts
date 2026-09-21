import { env } from "../config/env";
import { transition } from "./stateMachine";
import {
  ResponseClassification,
  StudentControlIntent,
  StudentThinkingState,
  TeachingAction,
  TeachingState,
} from "./types";

export interface PolicyDecision {
  action: TeachingAction;
  nextState: TeachingState;
  reason: string;
  antiDependencyTriggered: boolean;
}

/** Updates the bookkeeping counters on the thinking state given what the
 *  student's response was classified as. Pure function - state, no I/O. */
export function applyClassification(
  ts: StudentThinkingState,
  classification: ResponseClassification,
  currentState: TeachingState
): StudentThinkingState {
  const isCorrect = classification === "CORRECT_REASONING" || classification === "CORRECT_GUESS";
  return {
    ...ts,
    responseState: classification,
    misconception: classification === "MISCONCEPTION" ? "percentage_increase_decrease_cancel" : ts.misconception,
    consecutiveIncorrect: isCorrect ? 0 : ts.consecutiveIncorrect + 1,
    turnsInCurrentState: ts.turnsInCurrentState + 1,
    totalTurns: ts.totalTurns + 1,
    understandingState:
      classification === "CORRECT_REASONING"
        ? "demonstrated"
        : classification === "PARTIALLY_CORRECT"
        ? "partial"
        : ts.understandingState,
  };
}

/** Resets the per-state turn counter whenever the persisted state actually
 *  changes, so caps like maxTurnsPerState apply per-visit, not cumulatively. */
export function resetTurnCounterIfChanged(
  ts: StudentThinkingState,
  fromState: TeachingState,
  toState: TeachingState
): StudentThinkingState {
  if (fromState === toState) return ts;
  return { ...ts, turnsInCurrentState: 0 };
}

function actionForState(state: TeachingState): TeachingAction {
  switch (state) {
    case "HINT":
      return "HINT";
    case "PARTIAL_EXPLANATION":
      return "EXPLAIN";
    case "TEACH_BACK":
      return "REFLECT";
    case "INDEPENDENT_ATTEMPT":
    case "TRANSFER_VERIFICATION":
      return "VERIFY";
    case "COMPLETED":
      return "COMPLETE";
    case "ESCALATED":
      return "ESCALATE";
    default:
      return "ASK";
  }
}

/**
 * Decides the next teaching action + state. Implements the anti-dependency
 * guard from section 36: two or more consecutive hint requests without an
 * intervening independent attempt trigger a "think first" prompt instead of
 * another hint.
 */
export function decide(
  state: TeachingState,
  thinkingState: StudentThinkingState,
  classification: ResponseClassification,
  controlIntent: StudentControlIntent
): PolicyDecision {
  if (controlIntent === "request_hint" && thinkingState.consecutiveHints >= 2) {
    return {
      action: "ASK",
      nextState: "GUIDED_REASONING",
      reason: "anti_dependency_think_first",
      antiDependencyTriggered: true,
    };
  }

  const result = transition({
    state,
    classification,
    controlIntent,
    thinkingState,
    limits: {
      maxHintLevel: env.maxHintLevel,
      maxTurnsPerState: env.maxTurnsPerState,
      maxLoopBacks: env.maxLoopBacks,
    },
  });

  return {
    action: actionForState(result.nextState),
    nextState: result.nextState,
    reason: result.reason,
    antiDependencyTriggered: false,
  };
}
