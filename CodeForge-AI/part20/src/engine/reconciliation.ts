import type { ConsistencyDimension, DimensionResult, Finding, RawReasoningClaim, ReconciliationState } from "../types";

// Targeted question templates. Deliberately specific per-dimension (per spec:
// never generate a generic "can you explain more?"), and interpolate a
// concrete subject (variable name, edge case) from finding.metadata when
// available so the question reads like the doc's own examples.
const QUESTION_TEMPLATES: Partial<Record<ConsistencyDimension, (f: Finding) => string>> = {
  STATE_ALIGNMENT: (f) =>
    f.metadata?.variable
      ? `What must be true about \`${f.metadata.variable}\` at the point your code reaches it? Walk through what the implementation actually does with it.`
      : "What must be true about the key variable here once the relevant loop finishes?",
  ALGORITHM_ALIGNMENT: () => "Which specific part of your implementation — which loop or condition — performs the behavior you described?",
  COMPLEXITY_ALIGNMENT: () => "Is there any operation in your solution that runs once per element, for every other element? What would that do to the complexity you claimed?",
  SPACE_ALIGNMENT: () => "Does any data structure in your solution grow as the input grows? What does that imply about the extra memory it uses?",
  DATA_STRUCTURE_ALIGNMENT: () => "Which data structure does your code actually use here, and how is it populated and queried?",
  EDGE_CASE_ALIGNMENT: (f) =>
    f.metadata?.case
      ? `What actually happens in your code when the input is "${f.metadata.case}"? Trace through it step by step.`
      : "What actually happens in your code for this edge case? Trace through it step by step.",
  CORRECTNESS_ALIGNMENT: () => "Your code passes the tests — can you walk through exactly why, in terms of what the code does, not just that it works?",
};

export function generateReconciliationQuestion(
  findings: Finding[],
): { findingId: string; dimension: ConsistencyDimension; question: string } | null {
  const ranked = [...findings]
    .filter((f) => f.reconciliationState === "UNRESOLVED" || f.reconciliationState === "STILL_INCONSISTENT")
    .filter((f) => f.severity !== "LOW") // low-severity/insufficient-evidence findings aren't worth interrupting the student for
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.confidence - a.confidence);

  const top = ranked[0];
  if (!top) return null;

  const template = QUESTION_TEMPLATES[top.dimension];
  const question = template ? template(top) : `Can you walk through exactly what happens in your code related to: ${top.summary}`;
  return { findingId: top.id, dimension: top.dimension, question };
}

function severityRank(s: Finding["severity"]): number {
  return { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 }[s];
}

/**
 * Applies a student's answer to a reconciliation question. `newClaims` should
 * already be run through your existing claim-extraction system (the same one
 * that produced the original RawReasoningClaims); `recomparator` re-runs just
 * the relevant dimension's comparator against those new claims and returns
 * the updated DimensionResult.
 */
export async function applyReconciliationAnswer(params: {
  finding: Finding;
  studentAnswerText: string;
  newClaims: RawReasoningClaim[];
  recomparator: (finding: Finding, newClaims: RawReasoningClaim[]) => DimensionResult | Promise<DimensionResult>;
}): Promise<{ updatedFinding: Finding; updatedDimensionResult: DimensionResult }> {
  const updatedDimensionResult = await params.recomparator(params.finding, params.newClaims);

  let reconciliationState: ReconciliationState;
  if (updatedDimensionResult.alignment === "MATCH") reconciliationState = "CORRECTED";
  else if (updatedDimensionResult.alignment === "PARTIAL") reconciliationState = "PARTIALLY_CORRECTED";
  else if (updatedDimensionResult.alignment === "MISMATCH") reconciliationState = "STILL_INCONSISTENT";
  else reconciliationState = "CLARIFIED";

  const updatedFinding: Finding = { ...params.finding, reconciliationState };
  return { updatedFinding, updatedDimensionResult };
}
