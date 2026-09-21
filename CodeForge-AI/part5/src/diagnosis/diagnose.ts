import type { Diagnosis, EvaluationResult, MistakeCategory } from '../types.js';

/**
 * Classifies WHY a submission failed, purely from real execution evidence.
 * This is deterministic pattern matching over EvaluationResult — no AI, no
 * fabrication. It is intentionally conservative: when the pattern is
 * ambiguous it falls back to the most defensible category rather than
 * guessing a specific one (Phase 10 — never invent certainty).
 */
export function diagnose(evaluation: EvaluationResult): Diagnosis {
  if (evaluation.passed) {
    return {
      attemptId: evaluation.attemptId,
      mistakeCategory: 'NONE',
      languageIssue: false,
      failurePattern: null,
      details: `All ${evaluation.testsTotal} test cases passed.`,
    };
  }

  if (evaluation.syntaxError) {
    return {
      attemptId: evaluation.attemptId,
      mistakeCategory: 'SYNTAX_ERROR',
      languageIssue: true, // this is a LANGUAGE proficiency signal, not an algorithmic one (Phase 34)
      failurePattern: 'submission-failed-to-load',
      details: 'The submission could not be parsed/loaded — this reflects language syntax familiarity, not algorithmic reasoning.',
    };
  }

  if (evaluation.timeout) {
    return {
      attemptId: evaluation.attemptId,
      mistakeCategory: 'COMPLEXITY_ISSUE',
      languageIssue: false,
      failurePattern: 'timeout',
      details: 'Execution exceeded the time limit — likely an inefficient approach (wrong complexity class) rather than a logic error.',
    };
  }

  const failed = evaluation.results.filter((r) => !r.passed);
  const failedCategories = new Set(failed.map((r) => r.category));
  const passedCategories = new Set(evaluation.results.filter((r) => r.passed).map((r) => r.category));

  // Failure pattern: only the 'interleaved' / stateful-sequence category
  // fails while 'basic' passes -> the algorithm is right for simple cases
  // but state isn't carried correctly across a sequence of operations.
  if (failedCategories.has('interleaved') && passedCategories.has('basic')) {
    return {
      attemptId: evaluation.attemptId,
      mistakeCategory: 'STATE_MANAGEMENT_ERROR',
      languageIssue: false,
      failurePattern: 'basic-passed-interleaved-failed',
      details: 'Passes straightforward single-pass scenarios but fails once operations are interleaved — the implementation is not correctly carrying state across calls.',
    };
  }

  // Only 'edge' cases fail, everything else passes -> boundary handling.
  if (failedCategories.has('edge') && !failedCategories.has('basic') && !failedCategories.has('interleaved')) {
    return {
      attemptId: evaluation.attemptId,
      mistakeCategory: 'BOUNDARY_CONDITION',
      languageIssue: false,
      failurePattern: 'edge-cases-only',
      details: 'Core logic is correct but boundary/edge cases (empty input, first/last element, etc.) are mishandled.',
    };
  }

  // Any failed case has a runtime error (exception) rather than a wrong value.
  if (failed.some((r) => r.error)) {
    return {
      attemptId: evaluation.attemptId,
      mistakeCategory: 'RUNTIME_ERROR',
      languageIssue: false,
      failurePattern: 'exception-during-execution',
      details: 'The submission throws at runtime on at least one test case rather than producing a wrong-but-defined answer.',
    };
  }

  // Passed nothing at all -> treat as incomplete/fundamental logic gap.
  if (evaluation.testsPassed === 0) {
    return {
      attemptId: evaluation.attemptId,
      mistakeCategory: 'INCOMPLETE',
      languageIssue: false,
      failurePattern: 'zero-passed',
      details: 'No test cases passed — the core approach has not yet produced a working solution.',
    };
  }

  // Mixed basic failures with correct output shape -> general logic error.
  return {
    attemptId: evaluation.attemptId,
    mistakeCategory: 'LOGIC_ERROR',
    languageIssue: false,
    failurePattern: 'wrong-output-on-basic-cases',
    details: `Produces output of the right shape but the wrong value on ${failed.length}/${evaluation.testsTotal} case(s) — a reasoning/logic issue rather than a crash.`,
  };
}

export function isPositiveMistake(cat: MistakeCategory): boolean {
  return cat === 'NONE';
}
