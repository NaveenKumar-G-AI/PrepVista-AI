// ============================================================================
// Phase model (Section 4-5)
// ============================================================================
// Owns: what phase the student is conceptually in, what changes when the
// phase changes, and what a sane next phase looks like given the state.
//
// This does NOT decide when to actually move the student's `currentPhase` —
// callers (the orchestrator / API handlers) apply `suggestNextPhase` output
// as they see fit, so a human-in-the-loop or an explicit student action can
// still override it. This module just encodes what "sane" means.
// ============================================================================

import { DebuggingCoachState, DebuggingPhase, PHASE_ORDER, HypothesisStatus } from "../types.js";

/** Canonical coaching question per phase (Section 4). Used as the deterministic
 * fallback when AI coaching is unavailable (Section 42), and as the seed the
 * AI layer is expected to personalize rather than replace outright. */
export const PHASE_CANONICAL_QUESTION: Record<DebuggingPhase, string> = {
  [DebuggingPhase.OBSERVE]:
    "Let's first establish exactly what differs between expected and actual behavior. What do you observe?",
  [DebuggingPhase.REPRODUCE]:
    "Can you reproduce the failure with the provided input before changing the code?",
  [DebuggingPhase.LOCALIZE]:
    "At which point does the program first diverge from expected behavior?",
  [DebuggingPhase.HYPOTHESIZE]:
    "What specific behavior do you think is responsible for the failure?",
  [DebuggingPhase.INVESTIGATE]:
    "What evidence would help you narrow down where that behavior comes from?",
  [DebuggingPhase.EXPERIMENT]:
    "What observation would prove or disprove that hypothesis?",
  [DebuggingPhase.ROOT_CAUSE]:
    "What underlying state or assumption causes the observed failure?",
  [DebuggingPhase.FIX]:
    "What is the smallest change that restores the correct behavior?",
  [DebuggingPhase.VERIFY]:
    "Does the fix preserve the cases that were already working?",
  [DebuggingPhase.RESOLVED]:
    "What was the root cause, and what evidence first convinced you?",
};

/**
 * Explicit adjacency: which phases a student can plausibly move to from a
 * given phase. Debugging is not strictly linear — a rejected hypothesis
 * legitimately sends you back to HYPOTHESIZE or even LOCALIZE, and a failed
 * regression sends you back to FIX — so this is a directed graph, not a
 * straight line, even though PHASE_ORDER gives the "default" forward path.
 */
const PHASE_ADJACENCY: Record<DebuggingPhase, DebuggingPhase[]> = {
  [DebuggingPhase.OBSERVE]: [DebuggingPhase.REPRODUCE],
  [DebuggingPhase.REPRODUCE]: [DebuggingPhase.LOCALIZE, DebuggingPhase.OBSERVE],
  [DebuggingPhase.LOCALIZE]: [DebuggingPhase.HYPOTHESIZE, DebuggingPhase.REPRODUCE],
  [DebuggingPhase.HYPOTHESIZE]: [DebuggingPhase.INVESTIGATE, DebuggingPhase.EXPERIMENT, DebuggingPhase.LOCALIZE],
  [DebuggingPhase.INVESTIGATE]: [DebuggingPhase.EXPERIMENT, DebuggingPhase.HYPOTHESIZE],
  [DebuggingPhase.EXPERIMENT]: [DebuggingPhase.ROOT_CAUSE, DebuggingPhase.HYPOTHESIZE, DebuggingPhase.INVESTIGATE],
  [DebuggingPhase.ROOT_CAUSE]: [DebuggingPhase.FIX, DebuggingPhase.EXPERIMENT],
  [DebuggingPhase.FIX]: [DebuggingPhase.VERIFY, DebuggingPhase.ROOT_CAUSE],
  [DebuggingPhase.VERIFY]: [DebuggingPhase.RESOLVED, DebuggingPhase.FIX, DebuggingPhase.ROOT_CAUSE],
  [DebuggingPhase.RESOLVED]: [],
};

export function canTransition(from: DebuggingPhase, to: DebuggingPhase): boolean {
  if (from === to) return true;
  return PHASE_ADJACENCY[from].includes(to);
}

/**
 * Deterministic "what phase should we be in" suggestion, derived purely from
 * observable state — no AI involved (Section 38: phase tracking is not an
 * authoritative-AI decision). Intentionally conservative: only suggests a
 * move when the current phase's exit condition is clearly met.
 */
export function suggestNextPhase(state: DebuggingCoachState): DebuggingPhase {
  const { currentPhase, hypotheses, reproductionStatus, knownRootCause, fixState, regressionState } = state;

  switch (currentPhase) {
    case DebuggingPhase.OBSERVE:
      return state.evidence.failure ? DebuggingPhase.REPRODUCE : DebuggingPhase.OBSERVE;

    case DebuggingPhase.REPRODUCE:
      return reproductionStatus === "REPRODUCED" ? DebuggingPhase.LOCALIZE : DebuggingPhase.REPRODUCE;

    case DebuggingPhase.LOCALIZE:
      return state.evidence.failure?.sourceLocation ? DebuggingPhase.HYPOTHESIZE : DebuggingPhase.LOCALIZE;

    case DebuggingPhase.HYPOTHESIZE:
      return hypotheses.length > 0 ? DebuggingPhase.INVESTIGATE : DebuggingPhase.HYPOTHESIZE;

    case DebuggingPhase.INVESTIGATE: {
      // "Experimentation has started" means some hypothesis has moved past
      // a bare proposal — whether it's actively TESTING or has already
      // resolved to SUPPORTED/REJECTED/INCONCLUSIVE. Checking only for
      // TESTING would strand a state that resolved a hypothesis in one
      // fast-moving batch of updates.
      const experimentationStarted = hypotheses.some((h) => h.status !== HypothesisStatus.PROPOSED);
      return experimentationStarted ? DebuggingPhase.EXPERIMENT : DebuggingPhase.INVESTIGATE;
    }

    case DebuggingPhase.EXPERIMENT: {
      const supported = hypotheses.some((h) => h.status === HypothesisStatus.SUPPORTED);
      const allDead =
        hypotheses.length > 0 &&
        hypotheses.every((h) => h.status === HypothesisStatus.REJECTED || h.status === HypothesisStatus.ABANDONED);
      if (supported) return DebuggingPhase.ROOT_CAUSE;
      if (allDead) return DebuggingPhase.HYPOTHESIZE; // back to the drawing board
      return DebuggingPhase.EXPERIMENT;
    }

    case DebuggingPhase.ROOT_CAUSE:
      return knownRootCause ? DebuggingPhase.FIX : DebuggingPhase.ROOT_CAUSE;

    case DebuggingPhase.FIX:
      return fixState.proposed ? DebuggingPhase.VERIFY : DebuggingPhase.FIX;

    case DebuggingPhase.VERIFY:
      if (regressionState.passed === true) return DebuggingPhase.RESOLVED;
      if (regressionState.passed === false) return DebuggingPhase.FIX; // regression → back to fixing
      return DebuggingPhase.VERIFY;

    case DebuggingPhase.RESOLVED:
      return DebuggingPhase.RESOLVED;

    default:
      return currentPhase;
  }
}

export function phaseIndex(phase: DebuggingPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Repeatedly applies `suggestNextPhase` until it stabilizes, so a burst of
 * state changes (several evidence fields arriving together, or several
 * handler calls in quick succession before a phase-progression check ran)
 * doesn't leave `currentPhase` stuck one hop behind what the evidence
 * actually supports. Bounded by the number of phases so a misbehaving
 * adjacency graph can never loop forever.
 */
export function advancePhase(state: DebuggingCoachState): DebuggingPhase {
  let phase = state.currentPhase;
  for (let i = 0; i < PHASE_ORDER.length; i++) {
    const next = suggestNextPhase({ ...state, currentPhase: phase });
    if (next === phase || !canTransition(phase, next)) break;
    phase = next;
  }
  return phase;
}

/** True if `to` is strictly earlier in the default ordering than `from` — i.e. this is a "back up" move, not forward progress. */
export function isBacktrack(from: DebuggingPhase, to: DebuggingPhase): boolean {
  return phaseIndex(to) < phaseIndex(from);
}
