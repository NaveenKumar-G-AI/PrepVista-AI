// ============================================================================
// Phase 14 — "Compare Student Code + Student Explanation. Classify evidence
// conceptually as: CONSISTENT / PARTIALLY_CONSISTENT / UNCERTAIN /
// POTENTIAL_INCONSISTENCY. Do not automatically accuse the student of
// cheating or dishonesty."
//
// Notice the class names: the strongest label this module ever produces is
// POTENTIAL_INCONSISTENCY — never "LIE", "CHEATED", or "DISHONEST". That's
// not a copywriting choice, it's the actual constraint: this function's
// output type physically cannot express an accusation, which is what makes
// Phase 14's "do not automatically accuse" durable even if a caller forgets
// to add a disclaimer.
// ============================================================================

import type { ConsistencyClass } from "../../domain/types.js";

export interface ConsistencyCheckInput {
  /** True facts about what the code actually does/contains, e.g. from verifiedComponents or static analysis. */
  verifiedCodeFacts: string[];
  studentExplanation: string;
  /** Did the AI evaluation raise a consistency flag for this response? */
  aiFlaggedConsistency?: "CONSISTENT" | "PARTIALLY_CONSISTENT" | "UNCERTAIN" | "POTENTIAL_INCONSISTENCY";
}

export function classifyConsistency(input: ConsistencyCheckInput): ConsistencyClass {
  // No AI signal and nothing to check against -> we simply don't know.
  if (!input.aiFlaggedConsistency && input.verifiedCodeFacts.length === 0) {
    return "UNCERTAIN";
  }

  // The AI evaluation is the primary signal (Phase 39 pipeline runs it with
  // both the code and the explanation in context) — this function's job is
  // to constrain its output to the four allowed classes and to downgrade
  // low-signal cases to UNCERTAIN rather than let a shaky AI call produce a
  // confident POTENTIAL_INCONSISTENCY.
  if (input.aiFlaggedConsistency) {
    if (input.studentExplanation.trim().length < 15) {
      // Too little to say anything came from was said; don't let a near-empty
      // response get classified as anything stronger than uncertain.
      return "UNCERTAIN";
    }
    return input.aiFlaggedConsistency;
  }

  return "UNCERTAIN";
}

/**
 * A student explaining "I don't know" or giving no answer is never evidence
 * of inconsistency — it's simply absence of evidence (Phase 27). Callers
 * should check this before invoking classifyConsistency at all for
 * INSUFFICIENT-correctness responses.
 */
export function isEligibleForConsistencyCheck(studentExplanation: string): boolean {
  const trimmed = studentExplanation.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  if (["i don't know", "idk", "not sure", "no idea"].includes(trimmed)) return false;
  return true;
}
