/**
 * CodeForge — Evaluation Service (§24, §25, §26, §44)
 *
 * Deterministic evaluation and AI evaluation are kept strictly separate, per
 * §24/§25: AI never overrides an execution result, and a failed/unavailable
 * AI call never turns into a wrong PASS/FAIL — it turns into `pending: true`
 * on the AI side while the deterministic side (already computed, already
 * final) is untouched.
 */

import {
  ExecutionStatus,
  type AIEvaluationResult,
  type Challenge,
  type DeterministicEvaluationResult,
  type MistakeCategory,
  type SupportedLanguage,
  type TestResult,
} from "../domain/types.js";
import { runTestCase } from "../execution/executor.js";
import type { AIProvider } from "../ai/aiProvider.js";

/** Deterministic — no AI involved. Same execution engine used for grading is used for challenge validation. */
export function runDeterministicEvaluation(
  challenge: Challenge,
  language: SupportedLanguage,
  code: string,
  includeHidden = true,
): DeterministicEvaluationResult {
  const tests = includeHidden ? [...challenge.publicTests, ...challenge.hiddenTests] : challenge.publicTests;
  const { entryFunction, comparisonMode } = challenge.evaluationMetadata;

  if (tests.length === 0) {
    return {
      status: ExecutionStatus.SYSTEM_ERROR,
      testResults: [],
      testsPassed: 0,
      testsFailed: 0,
      runtimeMs: 0,
      compileError: "challenge has no tests configured",
      resourceLimitExceeded: false,
    };
  }

  // Probe with the first test — a compile/syntax error is deterministic across every input, so
  // there's no need to burn the resource budget re-running it once per test case.
  const first = tests[0]!;
  const probe = runTestCase(language, code, entryFunction, comparisonMode, first);
  if (probe.outcome.compileError) {
    const testResults: TestResult[] = tests.map((tc) => ({
      testId: tc.id,
      category: tc.category,
      hidden: tc.hidden,
      passed: false,
      expectedOutput: tc.hidden ? undefined : tc.expectedOutput,
      errorMessage: probe.outcome.compileError!,
      errorKind: "compile_error",
    }));
    return {
      status: ExecutionStatus.FAILED,
      testResults,
      testsPassed: 0,
      testsFailed: tests.length,
      runtimeMs: probe.outcome.wallTimeMs,
      compileError: probe.outcome.compileError,
      resourceLimitExceeded: false,
    };
  }

  const testResults: TestResult[] = [probe.result];
  let runtimeMs = probe.outcome.wallTimeMs;
  let resourceLimitExceeded = probe.outcome.resourceLimitExceeded;

  for (const tc of tests.slice(1)) {
    const { result, outcome } = runTestCase(language, code, entryFunction, comparisonMode, tc);
    testResults.push(result);
    runtimeMs += outcome.wallTimeMs;
    if (outcome.resourceLimitExceeded) resourceLimitExceeded = true;
  }

  const testsPassed = testResults.filter((r) => r.passed).length;
  const testsFailed = testResults.length - testsPassed;
  const status = testsFailed === 0 ? ExecutionStatus.PASSED : ExecutionStatus.FAILED;

  return { status, testResults, testsPassed, testsFailed, runtimeMs, compileError: null, resourceLimitExceeded };
}

/**
 * AI evaluation — qualitative only, layered on top of an already-final
 * deterministic result. On any provider failure this resolves to
 * `{ pending: true }` rather than throwing, so a submission is never scored
 * incorrectly because a vendor API had a bad moment (§44).
 */
export async function runAIEvaluation(
  provider: AIProvider,
  challenge: Challenge,
  language: SupportedLanguage,
  code: string,
  deterministic: DeterministicEvaluationResult,
  mistakeCategories: MistakeCategory[],
): Promise<AIEvaluationResult> {
  try {
    const coaching = await provider.coachOnAttempt({
      challengeTitle: challenge.title,
      challengeDescription: challenge.description,
      language,
      studentCode: code,
      testResults: deterministic.testResults,
      mistakeCategories,
    });
    return {
      provider: provider.name,
      pending: false,
      codeQualityNote: coaching.codeQualityNote,
      coachingMessage: coaching.coachingMessage,
      likelyMisconception: coaching.likelyMisconception,
    };
  } catch {
    return { provider: "none", pending: true };
  }
}
