import type { ErrorType, InterventionType } from "../types/errorTaxonomy.js";

/** §10 — describe observable behavior, never label the student. */
export const ERROR_FEEDBACK_TEMPLATES: Record<ErrorType, string> = {
  CONCEPTUAL_ERROR: "The setup doesn't match what this problem needs yet. Let's revisit the underlying idea before the next attempt.",
  STRATEGY_ERROR: "The calculation would work for a different problem structure. First check what the question is actually asking.",
  FORMULA_ERROR: "A formula was applied, but not the one this problem calls for — or a condition on it wasn't met.",
  CALCULATION_ERROR: "The setup was correct; the arithmetic changed the result along the way.",
  INPUT_MAPPING_ERROR: "The right method was chosen, but one or more values were substituted into the wrong place.",
  INTERPRETATION_ERROR: "The answer solves a slightly different question than the one being asked. Re-read what's actually being requested.",
  LOGIC_ERROR: "A step in the reasoning doesn't follow from the one before it — worth tracing back to find where.",
  CONSTRAINT_ERROR: "A condition or constraint on this problem wasn't accounted for.",
  VERIFICATION_ERROR: "The result wasn't checked against what's reasonable before submitting.",
  TRANSFER_ERROR: "This works on the familiar version — the new structure needs the same idea applied differently.",
  UNIT_ERROR: "Check the units — the value looks like it's being carried in the wrong unit somewhere in the working.",
  GUESSING_ERROR: "This looks like it wasn't fully worked through before answering. Let's slow down and work it step by step.",
  CARELESS_EXECUTION_SIGNAL: "The method and setup were right; something slipped in the execution. Worth a quick verification pass.",
  UNKNOWN: "Something about this attempt needs a closer look before we can target the right practice."
};

export const SELF_CHECK_PROMPTS: Record<string, string> = {
  PROBABILITY_RANGE: "Can a probability exceed 1?",
  PERCENTAGE_RANGE: "Does this percentage fall in a realistic range for the question?",
  MAGNITUDE_SANITY: "Before submitting: does this result seem reasonable given the numbers in the problem?",
  SIGN_CHECK: "Does the sign of this result make sense for what's being asked?",
  UNIT_CHECK: "Are the units in the final answer consistent with what the question asked for?"
};

export function whyThisFocusMessage(errorType: ErrorType, recurrenceNote?: string): string {
  const base = `Recent attempts show a concentration of ${humanize(errorType)} issues.`;
  return recurrenceNote ? `${base} ${recurrenceNote}` : base;
}

/** §68 — "No fake motivation." Report what changed, not a compliment. */
export function trainingResultSummary(params: {
  interventionType: InterventionType | null;
  beforePct: number | null;
  afterPct: number | null;
  independentVerificationPassed: boolean | null;
}): string {
  const focus = params.interventionType ? humanize(params.interventionType) : "this focus area";
  const trend =
    params.beforePct != null && params.afterPct != null
      ? `${focus[0]!.toUpperCase()}${focus.slice(1)} accuracy moved from ${params.beforePct}% to ${params.afterPct}% during this session.`
      : `${focus[0]!.toUpperCase()}${focus.slice(1)} accuracy was measured during this session.`;
  const verification =
    params.independentVerificationPassed == null
      ? ""
      : params.independentVerificationPassed
        ? " Independent verification passed."
        : " Independent verification did not pass yet — more practice is recommended before calling this resolved.";
  return `${trend}${verification}`;
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").toLowerCase();
}
