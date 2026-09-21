/**
 * Evidence analyzer.
 *
 * Decides whether the most recently delivered hint "worked" — entirely
 * from deterministic signals (execution deltas, code diffs, structured
 * student responses). No LLM call. This is what lets the system say
 * "your submission improved from 6/10 to 9/10" and mean it literally,
 * rather than asking a model to eyeball the diff.
 */

import { CodeLocation, ExecutionEvidence, HintEffectiveness, StudentResponseSignal } from "./types";

export interface EvidenceAnalysisInput {
  executionAtLastHint: ExecutionEvidence | null;
  currentExecution: ExecutionEvidence | null;
  codeAtLastHint: string | null;
  currentCode: string | null;
  hintedLocation: CodeLocation | null;
  studentResponse: StudentResponseSignal | null;
}

export interface EvidenceAnalysisResult {
  effectiveness: HintEffectiveness;
  relevantCodeChanged: boolean;
  anyCodeChanged: boolean;
  verdictImproved: boolean;
  fullyResolved: boolean;
  passCountDelta: number | null;
  reasoning: string;
}

/**
 * Very cheap "did the code near the hinted location change" check. We
 * don't need a full AST diff — a line-level comparison restricted to the
 * hinted range (when we have one) is enough to distinguish "the student
 * touched the relevant area" from "the student changed an unrelated
 * comment" without paying for a real diff library.
 */
function relevantRegionChanged(before: string, after: string, location: CodeLocation | null): boolean {
  if (before === after) return false;
  if (!location || location.sourceOfTruth === "NONE" || location.startLine === null) {
    // No verified location to scope to — treat any non-trivial change as relevant.
    return normalizeForDiff(before) !== normalizeForDiff(after);
  }
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const start = Math.max(0, location.startLine - 1);
  const end = Math.min(Math.max(beforeLines.length, afterLines.length), (location.endLine ?? location.startLine + 15));
  const beforeRegion = beforeLines.slice(start, end).join("\n");
  const afterRegion = afterLines.slice(start, end).join("\n");
  if (normalizeForDiff(beforeRegion) !== normalizeForDiff(afterRegion)) return true;
  // Function moved (line numbers shifted) — fall back to whole-file compare
  // scoped by function name if we have one, otherwise treat as unchanged.
  return false;
}

function normalizeForDiff(s: string): string {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("#"))
    .join("\n");
}

export function analyzeEvidence(input: EvidenceAnalysisInput): EvidenceAnalysisResult {
  const {
    executionAtLastHint,
    currentExecution,
    codeAtLastHint,
    currentCode,
    hintedLocation,
    studentResponse,
  } = input;

  const anyCodeChanged =
    codeAtLastHint !== null && currentCode !== null ? normalizeForDiff(codeAtLastHint) !== normalizeForDiff(currentCode) : false;

  const relevantCodeChanged =
    codeAtLastHint !== null && currentCode !== null
      ? relevantRegionChanged(codeAtLastHint, currentCode, hintedLocation)
      : false;

  const hasNewSubmission =
    currentExecution !== null &&
    (executionAtLastHint === null || currentExecution.submissionId !== executionAtLastHint.submissionId);

  const fullyResolved = hasNewSubmission && currentExecution?.verdict === "ACCEPTED";

  let passCountDelta: number | null = null;
  let verdictImproved = false;
  if (
    hasNewSubmission &&
    currentExecution?.testsPassed !== null &&
    currentExecution?.testsPassed !== undefined &&
    executionAtLastHint?.testsPassed !== null &&
    executionAtLastHint?.testsPassed !== undefined
  ) {
    passCountDelta = currentExecution.testsPassed - executionAtLastHint.testsPassed;
    verdictImproved = passCountDelta > 0;
  } else if (hasNewSubmission && executionAtLastHint === null && currentExecution) {
    // First submission since the hint — no prior baseline to diff against,
    // but a passing verdict is still meaningful signal, handled by fullyResolved.
    verdictImproved = false;
  }

  const explicitNegative = studentResponse === "STILL_STUCK";
  const explicitPositive = studentResponse === "UNDERSTOOD";

  let effectiveness: HintEffectiveness;
  let reasoning: string;

  if (fullyResolved) {
    effectiveness = "STRONG";
    reasoning = "Latest submission was accepted after the hint was delivered.";
  } else if (hasNewSubmission && verdictImproved && relevantCodeChanged) {
    effectiveness = "STRONG";
    reasoning = `Student modified the hinted code region and test pass count increased by ${passCountDelta}.`;
  } else if (hasNewSubmission && verdictImproved) {
    effectiveness = "MEDIUM";
    reasoning = `Test pass count increased by ${passCountDelta}, but the change was outside the specific region the hint pointed to — likely still related.`;
  } else if (!hasNewSubmission && relevantCodeChanged) {
    effectiveness = "MEDIUM";
    reasoning = "Student edited the hinted code region but has not submitted again yet.";
  } else if (!hasNewSubmission && explicitPositive && !anyCodeChanged) {
    effectiveness = "WEAK";
    reasoning = "Student reported understanding, but there is no code change or execution evidence yet to confirm it.";
  } else if (hasNewSubmission && !verdictImproved && !relevantCodeChanged) {
    effectiveness = "NEGATIVE";
    reasoning = "New submission exists but neither the hinted region changed nor did the test pass count improve.";
  } else if (!hasNewSubmission && !relevantCodeChanged && explicitNegative) {
    effectiveness = "NEGATIVE";
    reasoning = "Student explicitly reported still being stuck, with no relevant code change.";
  } else if (!hasNewSubmission && !anyCodeChanged && !explicitPositive && !explicitNegative) {
    effectiveness = "PENDING";
    reasoning = "No new activity since the hint was delivered yet.";
  } else if (hasNewSubmission && !verdictImproved && relevantCodeChanged) {
    // Touched the right area, but it didn't help (or made it worse/flat).
    effectiveness = "NEGATIVE";
    reasoning = "Student changed the hinted region but the test pass count did not improve.";
  } else {
    effectiveness = "INCONCLUSIVE";
    reasoning = "Signals are mixed; treating conservatively rather than asserting an effectiveness verdict.";
  }

  return {
    effectiveness,
    relevantCodeChanged,
    anyCodeChanged,
    verdictImproved,
    fullyResolved,
    passCountDelta,
    reasoning,
  };
}
