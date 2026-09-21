import type { AggregateResult, EvaluationPolicy } from "./types";

/**
 * This is the ONE function in the codebase allowed to turn an
 * AggregateResult into something a student's browser receives.
 * Every API route that returns evaluation data must go through this
 * (never serialize AggregateResult or TestOutcome[] directly) — see
 * tests/integration/anti-leakage.test.ts, which asserts this by
 * fuzzing real hidden input/output strings into a result and
 * confirming none of them appear anywhere in the serialized output,
 * across every assessment mode.
 *
 * Field-by-field allowlist per mode, on purpose — additive, not
 * subtractive, so a newly-added internal field is excluded by
 * default rather than leaked by default.
 */
export interface SafeResult {
  submissionId: string;
  status: string;
  overallVerdict: string;
  score?: number;
  maxScore?: number;
  message: string;
  hiddenCategoryResults?: Record<string, { passed: number; total: number }>;
  hiddenSummary?: string; // interview mode: qualitative only, no numbers
}

const FAILURE_MESSAGES: Record<string, string> = {
  ACCEPTED: "All tests passed.",
  WRONG_ANSWER: "Some unseen cases produced incorrect output.",
  TIME_LIMIT_EXCEEDED: "Performance requirements were not satisfied.",
  MEMORY_LIMIT_EXCEEDED: "The solution used more memory than allowed.",
  RUNTIME_ERROR: "The program crashed on at least one unseen case.",
  COMPILATION_ERROR: "The submission did not compile.",
  OUTPUT_LIMIT_EXCEEDED: "The program produced more output than allowed.",
  SYSTEM_ERROR:
    "The evaluation service could not complete this submission. Your code was not marked incorrect. Please retry.",
  JUDGE_ERROR:
    "The evaluation service could not complete this submission. Your code was not marked incorrect. Please retry.",
};

export function toSafeResult(
  submissionId: string,
  status: string,
  result: AggregateResult | null,
  policy: EvaluationPolicy
): SafeResult {
  if (!result) {
    return { submissionId, status, overallVerdict: "PENDING", message: "Evaluation is still in progress." };
  }

  const message = FAILURE_MESSAGES[result.overallVerdict] ?? "Evaluation completed.";
  const base: SafeResult = {
    submissionId,
    status,
    overallVerdict: result.overallVerdict,
    message,
  };

  switch (policy.assessmentMode) {
    case "learning":
      return {
        ...base,
        score: result.score,
        maxScore: result.maxScore,
        hiddenCategoryResults: redactCounts(result.categoryResults),
      };
    case "practice":
      return {
        ...base,
        score: result.score,
        maxScore: result.maxScore,
        hiddenCategoryResults: redactCategoryPassFailOnly(result.categoryResults),
      };
    case "assessment":
      return {
        ...base,
        score: result.score,
        maxScore: result.maxScore,
        // deliberately no per-category breakdown — enough to trust the
        // number, not enough to map failures back to specific hidden groups
      };
    case "interview":
      return {
        ...base,
        hiddenSummary: result.overallVerdict === "ACCEPTED" ? "All checks passed." : "Some checks did not pass.",
        // no score, no category data, no counts
      };
    default: {
      const exhaustive: never = policy.assessmentMode;
      throw new Error(`unhandled assessment mode: ${exhaustive}`);
    }
  }
}

function redactCounts(
  categoryResults: Record<string, { passed: number; total: number }>
): Record<string, { passed: number; total: number }> {
  // learning mode: exact counts are fine — the point is to help the
  // student learn, and counts alone don't reveal input/output content.
  return categoryResults;
}

function redactCategoryPassFailOnly(
  categoryResults: Record<string, { passed: number; total: number }>
): Record<string, { passed: number; total: number }> {
  // practice mode: collapse to a coarse boolean-ish signal (0/1 vs total
  // capped at "some") rather than exact counts, so it's harder to use
  // repeated submissions to binary-search the exact hidden test count.
  const out: Record<string, { passed: number; total: number }> = {};
  for (const [cat, { passed, total }] of Object.entries(categoryResults)) {
    out[cat] = { passed: passed === total ? total : Math.min(passed, 1), total: Math.min(total, 3) };
  }
  return out;
}
