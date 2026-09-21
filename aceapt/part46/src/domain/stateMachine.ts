import { ResponseClassification, StudentControlIntent, StudentThinkingState, TeachingState } from "./types";

export interface TransitionLimits {
  maxHintLevel: number;
  maxTurnsPerState: number;
  maxLoopBacks: number;
}

export interface TransitionContext {
  state: TeachingState;
  classification: ResponseClassification;
  controlIntent: StudentControlIntent;
  thinkingState: StudentThinkingState;
  limits: TransitionLimits;
}

export interface TransitionResult {
  nextState: TeachingState;
  reason: string;
}

/**
 * Pure state-transition function. Only the states actually needed for the
 * shipped objective (percentage base-value identification) are wired below;
 * the full TeachingState union (see types.ts) is available for additional
 * objectives registered later - see section 20 of the spec ("only use states
 * relevant to the current interaction").
 *
 * Two states are deliberate pass-throughs and never persisted as "waiting on
 * the student": CHECKPOINT (always -> INDEPENDENT_ATTEMPT). Everything else
 * either asks the student something or evaluates what they just said.
 */
export function transition(ctx: TransitionContext): TransitionResult {
  const { state, classification, controlIntent, thinkingState, limits } = ctx;

  // Student-initiated overrides win over the default flow (section 55/56).
  if (controlIntent === "explain_directly" && state !== "COMPLETED" && state !== "ESCALATED") {
    return { nextState: "PARTIAL_EXPLANATION", reason: "student_requested_direct_explanation" };
  }
  if (controlIntent === "solve_independently" && state !== "COMPLETED" && state !== "ESCALATED") {
    return { nextState: "INDEPENDENT_ATTEMPT", reason: "student_requested_independent_attempt" };
  }

  // A detected misconception always takes priority, from any active
  // reasoning state, regardless of which step the student was on
  // (sections 27/130) - checked once here so no branch can accidentally
  // swallow it. HINT, INDEPENDENT_ATTEMPT, and TRANSFER_VERIFICATION used to
  // have no misconception branch of their own; this closes that gap for
  // every current and future state at once.
  if (
    classification === "MISCONCEPTION" &&
    state !== "MISCONCEPTION_CHECK" &&
    state !== "COMPLETED" &&
    state !== "ESCALATED"
  ) {
    return { nextState: "MISCONCEPTION_CHECK", reason: "misconception_detected" };
  }

  switch (state) {
    case "INTRODUCTION":
    case "OBJECTIVE_SETUP":
      return { nextState: "IDENTIFICATION", reason: "objective_set" };

    case "IDENTIFICATION": {
      if (classification === "CORRECT_REASONING") {
        return { nextState: "CHECKPOINT", reason: "reasoning_confirmed" };
      }
      if (classification === "CORRECT_GUESS" || classification === "PARTIALLY_CORRECT") {
        return { nextState: "GUIDED_REASONING", reason: "elicit_or_target_reasoning_gap" };
      }
      return { nextState: "HINT", reason: "incorrect_unclear_or_no_response" };
    }

    case "GUIDED_REASONING": {
      if (classification === "CORRECT_REASONING") {
        return { nextState: "CHECKPOINT", reason: "reasoning_confirmed" };
      }
      if (classification === "PARTIALLY_CORRECT") {
        if (thinkingState.turnsInCurrentState >= limits.maxTurnsPerState) {
          return { nextState: "HINT", reason: "partial_progress_capped_offer_hint" };
        }
        return { nextState: "GUIDED_REASONING", reason: "still_targeting_specific_gap" };
      }
      if (thinkingState.hintLevel < limits.maxHintLevel) {
        return { nextState: "HINT", reason: "escalate_hint" };
      }
      return { nextState: "PARTIAL_EXPLANATION", reason: "hint_ladder_exhausted" };
    }

    case "MISCONCEPTION_CHECK": {
      if (classification === "CORRECT_REASONING") {
        return { nextState: "CHECKPOINT", reason: "misconception_resolved" };
      }
      if (thinkingState.turnsInCurrentState >= limits.maxTurnsPerState) {
        return { nextState: "PARTIAL_EXPLANATION", reason: "experiment_inconclusive_after_cap" };
      }
      return { nextState: "MISCONCEPTION_CHECK", reason: "continue_contradiction_experiment" };
    }

    case "HINT": {
      if (classification === "CORRECT_REASONING") {
        return { nextState: "CHECKPOINT", reason: "recovered_after_hint" };
      }
      if (classification === "CORRECT_GUESS" || classification === "PARTIALLY_CORRECT") {
        return { nextState: "GUIDED_REASONING", reason: "partial_recovery_after_hint" };
      }
      if (thinkingState.hintLevel >= limits.maxHintLevel) {
        return { nextState: "PARTIAL_EXPLANATION", reason: "hint_ladder_exhausted" };
      }
      return { nextState: "GUIDED_REASONING", reason: "retry_after_hint" };
    }

    // Explanation was just shown; the same turn embeds a teach-back prompt,
    // so a reply here IS the teach-back attempt (see teachBack.ts / sessionEngine).
    case "PARTIAL_EXPLANATION": {
      if (classification === "CORRECT_REASONING") {
        return { nextState: "INDEPENDENT_ATTEMPT", reason: "teachback_passed_after_explanation" };
      }
      if (thinkingState.turnsInCurrentState >= 2) {
        // Never trap the student in the explanation loop (section 33/126).
        return { nextState: "INDEPENDENT_ATTEMPT", reason: "teachback_capped_after_explanation" };
      }
      return { nextState: "PARTIAL_EXPLANATION", reason: "teachback_needs_one_more_try" };
    }

    case "CHECKPOINT":
      return { nextState: "INDEPENDENT_ATTEMPT", reason: "checkpoint_passthrough" };

    case "INDEPENDENT_ATTEMPT": {
      if (classification === "CORRECT_REASONING" || classification === "CORRECT_GUESS") {
        return { nextState: "TRANSFER_VERIFICATION", reason: "independent_attempt_succeeded" };
      }
      if (thinkingState.consecutiveIncorrect >= limits.maxLoopBacks) {
        return { nextState: "ESCALATED", reason: "independent_attempt_failed_repeatedly" };
      }
      return { nextState: "GUIDED_REASONING", reason: "independent_attempt_needs_more_support" };
    }

    case "TRANSFER_VERIFICATION": {
      if (classification === "CORRECT_REASONING" || classification === "CORRECT_GUESS") {
        return { nextState: "TEACH_BACK", reason: "transfer_verified_moving_to_final_teachback" };
      }
      if (thinkingState.consecutiveIncorrect >= limits.maxLoopBacks) {
        return { nextState: "ESCALATED", reason: "transfer_gap_unresolved" };
      }
      return { nextState: "GUIDED_REASONING", reason: "transfer_gap_detected_do_not_mark_mastery" };
    }

    // Final teach-back, only reached from a verified transfer attempt.
    case "TEACH_BACK": {
      if (classification === "CORRECT_REASONING") {
        return { nextState: "COMPLETED", reason: "final_teachback_passed" };
      }
      if (thinkingState.turnsInCurrentState >= 2) {
        return { nextState: "COMPLETED", reason: "final_teachback_capped_but_independently_verified" };
      }
      return { nextState: "TEACH_BACK", reason: "final_teachback_needs_refinement" };
    }

    case "COMPLETED":
    case "ESCALATED":
      return { nextState: state, reason: "terminal_state" };

    default:
      return { nextState: "GUIDED_REASONING", reason: "fallback" };
  }
}
