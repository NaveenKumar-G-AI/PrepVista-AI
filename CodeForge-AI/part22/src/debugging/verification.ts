import type { MinimalChangeAnalysis, OverfittingSignal, RegressionVerification, RootCauseChain, TestOutcome } from "../types.js";

// ---------------------------------------------------------------------------
// Root-cause evidence validation
// ---------------------------------------------------------------------------

export interface RootCauseValidation {
  valid: boolean;
  errors: string[];
}

/**
 * The spec is explicit: "The AI evaluator must not invent this chain
 * without evidence." This is the enforcement point. An AI-proposed (or
 * student-proposed) root-cause chain is rejected - not silently accepted -
 * if any link is empty or if it cites zero supporting evidence.
 */
export function validateRootCauseChain(chain: RootCauseChain): RootCauseValidation {
  const errors: string[] = [];
  if (!chain.symptom.trim()) errors.push("symptom is empty");
  if (!chain.location.trim()) errors.push("location is empty");
  if (!chain.cause.trim()) errors.push("cause is empty");
  if (!chain.rootCause.trim()) errors.push("rootCause is empty");
  if (chain.supportingEvidence.length === 0) errors.push("no supporting evidence cited");
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Regression verification
// ---------------------------------------------------------------------------

/**
 * Pure aggregation over already-executed test outcomes. Actually *running*
 * those tests is the caller's job (via the sandbox executor) - this
 * function only combines results, so it stays unit-testable without
 * spawning processes and never has the option to fabricate a result for a
 * test it didn't actually see run.
 */
export function evaluateRegression(args: {
  originalFailureOutcome: TestOutcome;
  relatedTests: TestOutcome[];
  hiddenTests: TestOutcome[];
  regressionTests: TestOutcome[];
  resourceTests: TestOutcome[];
}): RegressionVerification {
  const relatedTestsPassed = args.relatedTests.every((t) => t.passed);
  const hiddenTestsPassed = args.hiddenTests.every((t) => t.passed);
  const regressionTestsPassed = args.regressionTests.every((t) => t.passed);
  const resourceTestsPassed = args.resourceTests.every((t) => t.passed);
  const originalFailureFixed = args.originalFailureOutcome.passed;

  return {
    originalFailureFixed,
    relatedTestsPassed,
    hiddenTestsPassed,
    regressionTestsPassed,
    resourceTestsPassed,
    hiddenTestResults: args.hiddenTests,
    overallPass: originalFailureFixed && relatedTestsPassed && hiddenTestsPassed && regressionTestsPassed && resourceTestsPassed
  };
}

// ---------------------------------------------------------------------------
// Overfitting detection
// ---------------------------------------------------------------------------

/**
 * Names the pattern, doesn't accuse. Per spec: "Do not accuse cheating.
 * Report: 'The current implementation passes the tested case but does not
 * generalize across the broader evaluation set.'"
 */
export function detectOverfitting(args: { visibleTests: TestOutcome[]; hiddenTests: TestOutcome[] }): OverfittingSignal {
  const visiblePassRate = passRate(args.visibleTests);
  const hiddenPassRate = passRate(args.hiddenTests);
  const reasons: string[] = [];

  if (args.visibleTests.length > 0 && args.hiddenTests.length > 0 && visiblePassRate === 1 && hiddenPassRate < 1) {
    reasons.push("The current implementation passes the tested case but does not generalize across the broader evaluation set.");
  }

  return { suspected: reasons.length > 0, reasons, visiblePassRate, hiddenPassRate };
}

function passRate(tests: TestOutcome[]): number {
  if (tests.length === 0) return 1;
  return tests.filter((t) => t.passed).length / tests.length;
}

// ---------------------------------------------------------------------------
// Minimal-change analysis
// ---------------------------------------------------------------------------

/**
 * A deliberately simple multiset line diff, NOT a real (Myers-style) diff -
 * good enough to produce "evidence, not an absolute rule" (per spec) about
 * how large/focused a fix was, but it will misjudge reordered blocks. A
 * production version should diff against real line ranges taken from the
 * editor/version-control layer. See README "Known Limitations".
 */
export function analyzeMinimalChange(before: string, after: string, suspectedLocation: string | null): MinimalChangeAnalysis {
  const beforeCounts = countLines(before);
  const afterCounts = countLines(after);

  let linesAdded = 0;
  for (const [line, count] of afterCounts) {
    const carriedOver = beforeCounts.get(line) ?? 0;
    if (count > carriedOver) linesAdded += count - carriedOver;
  }

  let linesRemoved = 0;
  for (const [line, count] of beforeCounts) {
    const stillPresent = afterCounts.get(line) ?? 0;
    if (count > stillPresent) linesRemoved += count - stillPresent;
  }

  const changedSomething = linesAdded + linesRemoved > 0;
  const suspectedLocationMentioned =
    suspectedLocation !== null && (before.includes(suspectedLocation) || after.includes(suspectedLocation));

  return {
    filesChanged: ["main"], // multi-file diffing is an integration point - see README
    linesAdded,
    linesRemoved,
    changedOutsideSuspectedLocation: changedSomething && suspectedLocation !== null && !suspectedLocationMentioned
  };
}

function countLines(source: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}
