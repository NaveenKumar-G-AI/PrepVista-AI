import { CorrectnessStatus, ConfidenceLevel, ErrorCategory, TestOutcome } from "../domain/enums.js";
import type { DeterministicVerdict, ExecutionEvidence, EvidenceConfidence } from "../domain/types.js";
import { clusterFailures } from "./failurePatterns.js";

/**
 * Pure function: ExecutionEvidence -> DeterministicVerdict.
 *
 * This function is the single source of truth for `status`. Nothing
 * downstream (including the AI layer) is permitted to change the value it
 * returns here. Every branch below is reachable by a real evidence shape —
 * there is no "ask the model" fallback baked into this file.
 */
export function classify(evidence: ExecutionEvidence): DeterministicVerdict {
  const { compilation, tests } = evidence;

  // --- 1. Compilation gate -------------------------------------------------
  if (compilation && compilation.attempted && !compilation.success) {
    return {
      status: CorrectnessStatus.DEFINITIVELY_INCORRECT,
      errorCategory: ErrorCategory.COMPILE_ERROR,
      confidence: { level: ConfidenceLevel.HIGH, reasons: ["Compilation failed; this is a deterministic, unambiguous fact."] },
      passRateAvailable: null,
      totalAvailable: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      clusters: [],
      summary: "Compilation failed. No test evidence is available because the program never ran.",
    };
  }

  // --- 2. No test evidence at all ------------------------------------------
  if (!tests || tests.totalAvailable === 0 || tests.results.length === 0) {
    return {
      status: CorrectnessStatus.UNKNOWN,
      errorCategory: ErrorCategory.NONE,
      confidence: { level: ConfidenceLevel.LOW, reasons: ["No execution evidence is available for this submission version."] },
      passRateAvailable: null,
      totalAvailable: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      clusters: [],
      summary: "No test evidence available yet.",
    };
  }

  const passed = tests.results.filter((t) => t.outcome === TestOutcome.PASS).length;
  const skipped = tests.results.filter((t) => t.outcome === TestOutcome.SKIPPED).length;
  const failing = tests.results.filter(
    (t) => t.outcome !== TestOutcome.PASS && t.outcome !== TestOutcome.SKIPPED
  );
  const failed = failing.length;
  const consideredTotal = tests.results.length - skipped;
  const passRate = consideredTotal > 0 ? passed / consideredTotal : null;

  const clusters = clusterFailures(failing);

  // --- 3. Dominant global error categories (apply when they hit every considered test) ---
  const dominantOutcome = dominantFailureOutcome(failing, consideredTotal);

  // --- 4. All available tests pass -----------------------------------------
  if (failed === 0 && passed > 0) {
    if (tests.gradingComplete) {
      return {
        status: CorrectnessStatus.ACCEPTED,
        errorCategory: ErrorCategory.NONE,
        confidence: { level: ConfidenceLevel.HIGH, reasons: ["Full authoritative test evidence (including hidden tests) confirms all cases pass."] },
        passRateAvailable: 1,
        totalAvailable: tests.totalAvailable,
        passed,
        failed,
        skipped,
        clusters: [],
        summary: `All ${passed} available tests pass, and this evidence set represents the complete authoritative judgment.`,
      };
    }
    return {
      status: CorrectnessStatus.LIKELY_CORRECT,
      errorCategory: ErrorCategory.NONE,
      confidence: {
        level: consideredTotal >= 5 ? ConfidenceLevel.MEDIUM : ConfidenceLevel.LOW,
        reasons: [
          `${passed}/${consideredTotal} available tests pass, but this is not confirmed as the complete authoritative test set.`,
        ],
      },
      passRateAvailable: 1,
      totalAvailable: tests.totalAvailable,
      passed,
      failed,
      skipped,
      clusters: [],
      summary: `All ${passed} available tests pass. Additional hidden evaluation may still exist.`,
    };
  }

  // --- 5. All available tests fail, with a single dominant deterministic cause ---
  if (passed === 0 && failed > 0 && dominantOutcome) {
    const category = outcomeToErrorCategory(dominantOutcome);
    return {
      status: tests.gradingComplete ? CorrectnessStatus.DEFINITIVELY_INCORRECT : CorrectnessStatus.LIKELY_INCORRECT,
      errorCategory: category,
      confidence: { level: ConfidenceLevel.HIGH, reasons: [`Every considered test failed with the same deterministic outcome: ${dominantOutcome}.`] },
      passRateAvailable: 0,
      totalAvailable: tests.totalAvailable,
      passed,
      failed,
      skipped,
      clusters,
      summary: `All ${failed} considered tests fail with outcome ${dominantOutcome}.`,
    };
  }

  // --- 6. All available tests fail, mixed causes ----------------------------
  if (passed === 0 && failed > 0) {
    return {
      status: tests.gradingComplete ? CorrectnessStatus.DEFINITIVELY_INCORRECT : CorrectnessStatus.LIKELY_INCORRECT,
      errorCategory: ErrorCategory.WRONG_ANSWER,
      confidence: { level: ConfidenceLevel.MEDIUM, reasons: ["All considered tests fail, but with varied failure outcomes."] },
      passRateAvailable: 0,
      totalAvailable: tests.totalAvailable,
      passed,
      failed,
      skipped,
      clusters,
      summary: `All ${failed} considered tests fail.`,
    };
  }

  // --- 7. Genuine partial correctness ---------------------------------------
  return {
    status: CorrectnessStatus.PARTIALLY_VALIDATED,
    errorCategory: ErrorCategory.WRONG_ANSWER,
    confidence: {
      level: consideredTotal >= 5 ? ConfidenceLevel.MEDIUM : ConfidenceLevel.LOW,
      reasons: [`${passed}/${consideredTotal} available tests pass; a genuine mixed result.`],
    },
    passRateAvailable: passRate,
    totalAvailable: tests.totalAvailable,
    passed,
    failed,
    skipped,
    clusters,
    summary: `${passed} of ${consideredTotal} considered tests pass; ${failed} fail.`,
  };
}

function dominantFailureOutcome(
  failing: { outcome: TestOutcome }[],
  consideredTotal: number
): TestOutcome | null {
  if (failing.length === 0 || failing.length !== consideredTotal) return null;
  const first = failing[0]?.outcome;
  if (first === undefined) return null;
  return failing.every((t) => t.outcome === first) ? first : null;
}

function outcomeToErrorCategory(outcome: TestOutcome): ErrorCategory {
  switch (outcome) {
    case TestOutcome.RUNTIME_ERROR:
      return ErrorCategory.RUNTIME_ERROR;
    case TestOutcome.TIMEOUT:
      return ErrorCategory.TIMEOUT;
    case TestOutcome.MEMORY_EXCEEDED:
      return ErrorCategory.MEMORY_LIMIT_EXCEEDED;
    case TestOutcome.WRONG_ANSWER:
    default:
      return ErrorCategory.WRONG_ANSWER;
  }
}

export type { EvidenceConfidence };
