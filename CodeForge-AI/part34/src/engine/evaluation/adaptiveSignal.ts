// ============================================================================
// Phase 21 — "Strong response -> deeper follow-up. Weak response ->
// clarification/simpler verification. Uncertain response -> additional
// evidence. Potential contradiction -> verification question."
//
// This module maps a completed Evaluation to exactly one of the four
// AdaptiveSignal branches. It is the single decision point the follow-up
// engine (followUp.ts) reads — keeping it separate from follow-up
// generation means the *classification* of a response is unit-testable
// without needing an AI gateway at all.
// ============================================================================

import type { AdaptiveSignal, ConsistencyClass, CorrectnessClass, EvaluationDimensions } from "../../domain/types.js";

export interface AdaptiveSignalInput {
  correctness: CorrectnessClass;
  dimensions: EvaluationDimensions;
  consistency?: ConsistencyClass;
}

export function deriveAdaptiveSignal(input: AdaptiveSignalInput): AdaptiveSignal {
  // Contradiction takes priority over everything else — even a
  // technically-correct-sounding answer that conflicts with verified code
  // facts needs a verification question before anything else happens.
  if (input.consistency === "POTENTIAL_INCONSISTENCY") {
    return "CONTRADICTION";
  }

  if (input.correctness === "INSUFFICIENT") {
    // Covers explicit "I don't know" (Phase 27) and non-answers — treated as
    // WEAK (prompts clarification/simpler verification), not as a
    // contradiction or an automatic skill failure.
    return "WEAK";
  }

  if (input.correctness === "INCORRECT") {
    return "WEAK";
  }

  if (input.consistency === "UNCERTAIN" || input.dimensions.understanding === "NOT_ASSESSED") {
    return "UNCERTAIN";
  }

  if (input.correctness === "CORRECT" || input.correctness === "MOSTLY_CORRECT") {
    const depthIsStrong = input.dimensions.depth === "DEEP" || input.dimensions.depth === "MODERATE";
    const reasoningIsStrong = input.dimensions.reasoningQuality === "STRONG" || input.dimensions.reasoningQuality === "ADEQUATE";
    if (depthIsStrong || reasoningIsStrong) return "STRONG";
  }

  // PARTIALLY_CORRECT, or CORRECT/MOSTLY_CORRECT without strong depth/reasoning
  // signals yet — there's something real here but it's not settled either way.
  return "UNCERTAIN";
}
