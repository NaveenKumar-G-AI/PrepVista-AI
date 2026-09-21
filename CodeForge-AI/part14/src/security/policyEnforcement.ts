import type { CoachingPolicyMode } from "../types";
import type { CoachResponse } from "../schema";

const MODE_ALLOWED_RESPONSE_TYPES: Record<CoachingPolicyMode, CoachResponse["response_type"][]> = {
  practice: ["OBSERVATION", "QUESTION", "HINT", "EXPLANATION", "REFLECTION", "CLARIFICATION", "SOLUTION_ASSISTANCE"],
  assessment: ["OBSERVATION", "QUESTION", "HINT", "CLARIFICATION"],
  interview: ["OBSERVATION", "QUESTION", "CLARIFICATION"],
};

export function isResponseTypeAllowed(mode: CoachingPolicyMode, responseType: CoachResponse["response_type"]): boolean {
  return MODE_ALLOWED_RESPONSE_TYPES[mode].includes(responseType);
}

/** Resolved issue -> back to depth 1 for the next (fresh) issue. Unresolved -> advance, capped at 5. */
export function nextCoachingDepth(currentDepth: number, issueResolved: boolean): number {
  if (issueResolved) return 1;
  return Math.min(currentDepth + 1, 5);
}
