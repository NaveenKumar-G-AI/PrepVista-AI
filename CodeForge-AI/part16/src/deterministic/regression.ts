import { TestOutcome } from "../domain/enums.js";
import type { CorrectnessDelta, ExecutionEvidence, DeterministicVerdict } from "../domain/types.js";

/**
 * Compares the previous and current deterministic verdicts + raw test
 * results for the same problem/user. Every field is derived from actual
 * submission data — there is no inferred or AI-estimated delta.
 */
export function computeDelta(
  previous: { verdict: DeterministicVerdict; evidence: ExecutionEvidence } | null,
  current: { verdict: DeterministicVerdict; evidence: ExecutionEvidence }
): CorrectnessDelta {
  if (!previous) {
    return {
      previousStatus: null,
      currentStatus: current.verdict.status,
      previousPassRate: null,
      currentPassRate: current.verdict.passRateAvailable,
      improvement: false,
      regression: false,
      newFailures: [],
      resolvedFailures: [],
    };
  }

  const prevResults = new Map((previous.evidence.tests?.results ?? []).map((t) => [t.id, t.outcome]));
  const currResults = new Map((current.evidence.tests?.results ?? []).map((t) => [t.id, t.outcome]));

  const newFailures: string[] = [];
  const resolvedFailures: string[] = [];

  // Only compare test ids that exist in BOTH snapshots — comparing across
  // different test id sets (e.g. a different problem) would be meaningless.
  for (const [id, prevOutcome] of prevResults) {
    const currOutcome = currResults.get(id);
    if (currOutcome === undefined) continue;
    const prevPassed = prevOutcome === TestOutcome.PASS;
    const currPassed = currOutcome === TestOutcome.PASS;
    if (prevPassed && !currPassed) newFailures.push(id);
    if (!prevPassed && currPassed) resolvedFailures.push(id);
  }

  const prevRate = previous.verdict.passRateAvailable;
  const currRate = current.verdict.passRateAvailable;

  const improvement =
    resolvedFailures.length > 0 && newFailures.length === 0
      ? true
      : prevRate !== null && currRate !== null
        ? currRate > prevRate
        : false;

  const regression =
    newFailures.length > 0 && resolvedFailures.length === 0
      ? true
      : prevRate !== null && currRate !== null
        ? currRate < prevRate
        : false;

  return {
    previousStatus: previous.verdict.status,
    currentStatus: current.verdict.status,
    previousPassRate: prevRate,
    currentPassRate: currRate,
    improvement,
    regression,
    newFailures,
    resolvedFailures,
  };
}
