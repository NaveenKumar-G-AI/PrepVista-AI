import type { SubmissionHistoryEntry } from "../types";

export interface AttemptComparisonResult {
  hasComparison: boolean;
  improved: boolean;
  regressed: boolean;
  unchanged: boolean;
  previousPassed?: number;
  previousTotal?: number;
  currentPassed?: number;
  currentTotal?: number;
  summary: string;
}

/**
 * Deliberately not AI. "Did the student improve" is a fact about the
 * execution record, not something to ask a language model — this is the
 * same principle as the rest of the "authoritative execution evidence"
 * boundary: deterministic systems own deterministic facts.
 */
export function compareAttempts(history: SubmissionHistoryEntry[]): AttemptComparisonResult {
  const scored = history.filter((h) => h.testsPassed !== undefined && h.testsTotal !== undefined);
  if (scored.length < 2) {
    return {
      hasComparison: false,
      improved: false,
      regressed: false,
      unchanged: false,
      summary: "Not enough submission history with test counts to compare.",
    };
  }

  const previous = scored[scored.length - 2];
  const current = scored[scored.length - 1];
  const improved = current.testsPassed! > previous.testsPassed!;
  const regressed = current.testsPassed! < previous.testsPassed!;
  const unchanged = !improved && !regressed;

  const summary = improved
    ? `Your change improved the result from ${previous.testsPassed}/${previous.testsTotal} to ${current.testsPassed}/${current.testsTotal}.`
    : regressed
      ? `This change went from ${previous.testsPassed}/${previous.testsTotal} to ${current.testsPassed}/${current.testsTotal} — worth checking what shifted.`
      : `Result is unchanged at ${current.testsPassed}/${current.testsTotal}.`;

  return {
    hasComparison: true,
    improved,
    regressed,
    unchanged,
    previousPassed: previous.testsPassed,
    previousTotal: previous.testsTotal,
    currentPassed: current.testsPassed,
    currentTotal: current.testsTotal,
    summary,
  };
}
