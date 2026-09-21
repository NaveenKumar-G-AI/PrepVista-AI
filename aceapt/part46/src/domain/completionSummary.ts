import { CompletionSummary, SocraticSession } from "./types";

const CRITERIA_LABELS: Record<string, string> = {
  identifies_original_value: "Identified original value",
  selects_correct_reference: "Selected correct operation",
  explains_reasoning: "Explained reasoning",
};

/**
 * Builds the end-of-session summary using ONLY criteria the session actually
 * recorded evidence for (session.thinkingState.achievedCriteria). Nothing
 * here is asserted because a lesson finished or the AI said "good" -
 * section 16/39/52/81 of the spec.
 */
export function buildCompletionSummary(session: SocraticSession): CompletionSummary {
  const achieved = new Set(session.thinkingState.achievedCriteria);

  const demonstrated = session.objective.successCriteria
    .filter((c) => achieved.has(c))
    .map((c) => CRITERIA_LABELS[c] ?? c);

  const stillDeveloping = session.objective.successCriteria
    .filter((c) => !achieved.has(c))
    .map((c) => CRITERIA_LABELS[c] ?? c);

  const level = session.thinkingState.hintLevel;
  const hintDependency = level === 0 ? "none" : level <= 2 ? "low" : level <= 4 ? "moderate" : "high";

  const verification: CompletionSummary["verification"] =
    session.state === "COMPLETED"
      ? "independent_problem_solved"
      : session.state === "ESCALATED"
      ? "verification_failed"
      : "not_verified";

  return {
    skill: session.objective.targetSkill,
    demonstrated,
    stillDeveloping,
    verification,
    hintDependency,
  };
}
