import type { AggregateResult, EvaluationPolicy, TestOutcome, Verdict } from "./types";
import { INFRASTRUCTURE_VERDICTS } from "./types";

/**
 * Aggregates already-computed TestOutcomes into one deterministic
 * result. Pure function — no I/O, no randomness — so the same
 * outcomes always aggregate to the same score (see
 * tests/unit/scoring.test.ts for the determinism check).
 */
export function aggregateResults(
  outcomes: TestOutcome[],
  policy: EvaluationPolicy
): AggregateResult {
  const hiddenOutcomes = outcomes.filter((o) => !o.isPublic);
  const totalWeight = hiddenOutcomes.reduce((sum, o) => sum + o.weight, 0) || 1;
  const earnedWeight = hiddenOutcomes
    .filter((o) => o.verdict === "ACCEPTED")
    .reduce((sum, o) => sum + o.weight, 0);

  const maxScore = 100;
  const score = Math.round((earnedWeight / totalWeight) * maxScore * 100) / 100;

  const categoryResults: Record<string, { passed: number; total: number }> = {};
  for (const o of hiddenOutcomes) {
    categoryResults[o.category] ??= { passed: 0, total: 0 };
    categoryResults[o.category]!.total += 1;
    if (o.verdict === "ACCEPTED") categoryResults[o.category]!.passed += 1;
  }

  const overallVerdict = computeOverallVerdict(outcomes, policy);

  return {
    overallVerdict,
    score,
    maxScore,
    passedCount: hiddenOutcomes.filter((o) => o.verdict === "ACCEPTED").length,
    failedCount: hiddenOutcomes.filter((o) => o.verdict !== "ACCEPTED").length,
    totalCount: hiddenOutcomes.length,
    categoryResults,
    outcomes,
  };
}

function computeOverallVerdict(outcomes: TestOutcome[], policy: EvaluationPolicy): Verdict {
  if (outcomes.length === 0) return "JUDGE_ERROR";

  // Any infrastructure failure anywhere makes the *run* JUDGE_ERROR —
  // never silently absorbed into a student-fault verdict, regardless
  // of how many other tests happened to pass.
  const infra = outcomes.find((o) => INFRASTRUCTURE_VERDICTS.has(o.verdict));
  if (infra) return infra.verdict;

  const allAccepted = outcomes.every((o) => o.verdict === "ACCEPTED");
  if (allAccepted) return "ACCEPTED";

  // First non-accepted, non-infrastructure verdict, in category-priority
  // order (deterministic — always the same choice for the same outcome set).
  const priority: Verdict[] = [
    "COMPILATION_ERROR",
    "RUNTIME_ERROR",
    "TIME_LIMIT_EXCEEDED",
    "MEMORY_LIMIT_EXCEEDED",
    "OUTPUT_LIMIT_EXCEEDED",
    "WRONG_ANSWER",
  ];
  for (const v of priority) {
    if (outcomes.some((o) => o.verdict === v)) return v;
  }
  return "WRONG_ANSWER";
}

/**
 * Decides whether to keep running remaining tests, per policy. Called
 * by the orchestrator between tests — kept as a pure function so its
 * logic is independently unit-testable.
 */
export function shouldStopEarly(
  outcomesSoFar: TestOutcome[],
  policy: EvaluationPolicy
): boolean {
  if (policy.earlyTermination === "none") return false;
  const last = outcomesSoFar[outcomesSoFar.length - 1];
  if (!last) return false;
  if (INFRASTRUCTURE_VERDICTS.has(last.verdict)) return false; // always gather full diagnostics on judge errors
  if (last.verdict === "ACCEPTED") return false;
  return policy.criticalCategories.includes(last.category);
}
