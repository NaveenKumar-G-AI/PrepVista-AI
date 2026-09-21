/**
 * Root-issue model.
 *
 * OBSERVED FAILURE -> LIKELY ROOT ISSUE -> RELEVANT CODE AREA ->
 * TEACHING OBJECTIVE -> CURRENT ASSISTANCE LEVEL
 *
 * The `observedFailure` string and `confidence` tier here are computed
 * deterministically from execution evidence — never asserted by the LLM.
 * The LLM (see prompt-builder.ts) is only ever asked to refine
 * `conceptDetail` / phrasing, constrained to this hypothesis, and its
 * output is validated to not contradict what we know for certain
 * (see output-guard.ts).
 */

import { CodeLocation, Confidence, ExecutionEvidence, RootIssueHypothesis, TeachingConcept } from "./types";

function describeObservedFailure(execution: ExecutionEvidence | null): { text: string; confidence: Confidence } {
  if (!execution) {
    return { text: "No execution result is available yet for this attempt.", confidence: "LOW" };
  }
  switch (execution.verdict) {
    case "ACCEPTED":
      return { text: "All tests passed.", confidence: "HIGH" };
    case "COMPILE_ERROR":
      return { text: "The submission failed to compile.", confidence: "HIGH" };
    case "RUNTIME_ERROR":
      return { text: "The submission raised a runtime error during execution.", confidence: "HIGH" };
    case "TIMEOUT":
      return { text: "The submission exceeded the time limit.", confidence: "HIGH" };
    case "MEMORY_LIMIT_EXCEEDED":
      return { text: "The submission exceeded the memory limit.", confidence: "HIGH" };
    case "WRONG_ANSWER": {
      const passed = execution.testsPassed;
      const total = execution.testsTotal;
      if (passed !== null && total !== null) {
        return { text: `${passed}/${total} tests passed; the rest produced incorrect output.`, confidence: "HIGH" };
      }
      return { text: "Some tests produced incorrect output.", confidence: "MEDIUM" };
    }
    case "PENDING":
      return { text: "Execution is still in progress.", confidence: "LOW" };
    default:
      return { text: "The execution result is inconclusive.", confidence: "LOW" };
  }
}

/**
 * Map deterministic evidence signals to a coarse teaching-concept bucket.
 * This is intentionally conservative: when the evidence doesn't clearly
 * point to one bucket, we use OTHER + LOW confidence rather than guessing,
 * and let the AI-generated `conceptDetail` carry the actual specificity
 * (with the AI's claim treated as a hypothesis, phrased with appropriate
 * uncertainty by the prompt rules, not as fact).
 */
function classifyConcept(execution: ExecutionEvidence | null, location: CodeLocation | null): { concept: TeachingConcept; confidence: Confidence } {
  if (!execution) return { concept: "OTHER", confidence: "LOW" };

  if (execution.verdict === "COMPILE_ERROR") return { concept: "SYNTAX_ERROR", confidence: "HIGH" };
  if (execution.verdict === "TIMEOUT") return { concept: "PERFORMANCE_COMPLEXITY", confidence: "MEDIUM" };
  if (execution.verdict === "MEMORY_LIMIT_EXCEEDED") return { concept: "PERFORMANCE_COMPLEXITY", confidence: "MEDIUM" };

  if (execution.verdict === "RUNTIME_ERROR") {
    const msg = (execution.runtimeError ?? execution.stackTrace ?? "").toLowerCase();
    if (/index|range|bounds|subscript/.test(msg)) return { concept: "BOUNDARY_CONDITION", confidence: "MEDIUM" };
    if (/null|undefined|none.*attribute|nullpointer/.test(msg)) return { concept: "NULL_UNDEFINED_HANDLING", confidence: "MEDIUM" };
    if (/type/.test(msg)) return { concept: "TYPE_MISMATCH", confidence: "MEDIUM" };
    return { concept: "OTHER", confidence: "LOW" };
  }

  if (execution.verdict === "WRONG_ANSWER") {
    // Wrong-answer with a function found near a loop/index construct is
    // the single most common signature of a boundary bug in these
    // problem formats; we flag it as a MEDIUM-confidence hypothesis
    // (strongly supported by code shape + requirements) rather than
    // HIGH, since we cannot be certain without hidden-case detail we're
    // deliberately not looking at.
    if (location?.snippet && /\b(len|length|size|count)\b.*[-+]\s*1|<=?\s*\w+\.(length|size)/i.test(location.snippet)) {
      return { concept: "BOUNDARY_CONDITION", confidence: "MEDIUM" };
    }
    return { concept: "OTHER", confidence: "LOW" };
  }

  return { concept: "OTHER", confidence: "LOW" };
}

function teachingObjectiveFor(concept: TeachingConcept): string {
  const objectives: Record<TeachingConcept, string> = {
    BOUNDARY_CONDITION: "Understand how the valid index/size range relates to the loop or condition that uses it.",
    OFF_BY_ONE: "Recognize how inclusive vs. exclusive bounds shift a result by one.",
    LOOP_LOGIC: "Trace what the loop's condition and update step actually guarantee by the time it exits.",
    RECURSION_BASE_CASE: "Identify what the smallest valid input should do and whether the base case matches it.",
    DATA_STRUCTURE_MISUSE: "Understand which operations the chosen data structure actually supports efficiently.",
    TYPE_MISMATCH: "Trace the actual type flowing through the expression versus the type it's compared or combined with.",
    NULL_UNDEFINED_HANDLING: "Identify the code path where a missing value isn't checked before being used.",
    ALGORITHM_CHOICE: "Reconsider whether the chosen approach actually satisfies the problem's constraints.",
    STATE_MUTATION: "Track how shared state changes across iterations or calls.",
    INPUT_PARSING: "Confirm the input is being read/parsed in the shape the problem actually provides it.",
    OUTPUT_FORMAT: "Confirm the output matches the exact format the problem expects.",
    PERFORMANCE_COMPLEXITY: "Reconsider the time/space complexity against the given constraints.",
    SYNTAX_ERROR: "Resolve the syntax issue preventing compilation.",
    OTHER: "Diagnose the specific behavior versus the expected behavior for this case.",
  };
  return objectives[concept];
}

export function buildRootIssueHypothesis(params: {
  execution: ExecutionEvidence | null;
  relevantArea: CodeLocation | null;
}): RootIssueHypothesis {
  const { text: observedFailure, confidence: failureConfidence } = describeObservedFailure(params.execution);
  const { concept, confidence: conceptConfidence } = classifyConcept(params.execution, params.relevantArea);

  // Overall confidence is the weaker of the two components — we don't
  // want a certain "6/10 tests failed" to lend false certainty to an
  // uncertain concept guess.
  const confidenceRank: Record<Confidence, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
  const overallConfidence: Confidence =
    confidenceRank[failureConfidence] <= confidenceRank[conceptConfidence] ? failureConfidence : conceptConfidence;

  return {
    observedFailure,
    concept,
    conceptDetail: teachingObjectiveFor(concept),
    relevantArea: params.relevantArea,
    teachingObjective: teachingObjectiveFor(concept),
    confidence: overallConfidence,
  };
}
