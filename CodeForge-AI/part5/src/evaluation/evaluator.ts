import { executeSubmission, type RunnerTestCase } from '../execution/runner.js';
import type { Challenge, EvaluationResult, Language, TestCase, TestCaseResult } from '../types.js';

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as object).sort();
    const bk = Object.keys(b as object).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/**
 * Runs a submission against a challenge's test cases for a given language and
 * produces a deterministic EvaluationResult. This is the ONLY place expected
 * values and actual sandbox output are ever compared — the sandbox process
 * itself never receives `expected`.
 */
export async function evaluateSubmission(opts: {
  attemptId: string;
  challenge: Challenge;
  language: Language;
  code: string;
  testCases: TestCase[]; // already filtered to this challenge + language
}): Promise<EvaluationResult> {
  const runnerCases: RunnerTestCase[] = opts.testCases.map((tc) => ({ id: tc.id, input: tc.input, category: tc.category }));

  const outcome = await executeSubmission({
    language: opts.language,
    harnessType: opts.challenge.harnessType,
    functionName: opts.challenge.functionName,
    code: opts.code,
    testCases: runnerCases,
  });

  if (outcome.globalError) {
    const isSyntax = /SyntaxError/i.test(outcome.globalError);
    const results: TestCaseResult[] = opts.testCases.map((tc) => ({
      testCaseId: tc.id,
      passed: false,
      error: 'Submission failed to load',
      timedOut: false,
      category: tc.category,
      runtimeMs: 0,
    }));
    return {
      attemptId: opts.attemptId,
      testsTotal: opts.testCases.length,
      testsPassed: 0,
      passed: false,
      runtimeError: !isSyntax,
      syntaxError: isSyntax,
      timeout: false,
      results,
    };
  }

  const rowById = new Map(outcome.rows.map((r) => [r.testCaseId, r]));
  const results: TestCaseResult[] = opts.testCases.map((tc) => {
    const row = rowById.get(tc.id);
    if (!row) {
      return { testCaseId: tc.id, passed: false, error: 'No result produced', timedOut: outcome.timedOut, category: tc.category, runtimeMs: 0 };
    }
    if (row.error) {
      return { testCaseId: tc.id, passed: false, error: row.error, timedOut: row.timedOut, category: tc.category, runtimeMs: row.runtimeMs };
    }
    const passed = deepEqual(row.actual, tc.expected);
    return { testCaseId: tc.id, passed, actual: row.actual, timedOut: row.timedOut, category: tc.category, runtimeMs: row.runtimeMs };
  });

  const testsPassed = results.filter((r) => r.passed).length;
  const hasRuntimeError = results.some((r) => !r.passed && r.error && !r.timedOut);
  const hasTimeout = results.some((r) => r.timedOut);

  return {
    attemptId: opts.attemptId,
    testsTotal: results.length,
    testsPassed,
    passed: testsPassed === results.length && results.length > 0,
    runtimeError: hasRuntimeError,
    syntaxError: false,
    timeout: hasTimeout,
    results,
  };
}

/** Strips hidden-test detail before anything is returned to a client — never leaks hidden inputs/expected values. */
export function toClientSafeResult(evaluation: EvaluationResult, testCases: TestCase[]): EvaluationResult {
  const hiddenIds = new Set(testCases.filter((tc) => tc.isHidden).map((tc) => tc.id));
  return {
    ...evaluation,
    results: evaluation.results.map((r) =>
      hiddenIds.has(r.testCaseId)
        ? { testCaseId: r.testCaseId, passed: r.passed, timedOut: r.timedOut, category: 'hidden', runtimeMs: r.runtimeMs }
        : r,
    ),
  };
}
