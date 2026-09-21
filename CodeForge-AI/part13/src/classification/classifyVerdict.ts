import type { FailureOrigin, Verdict } from "../types/enums.js";
import type { NormalizedExecutionResult, NormalizedTestOutcome } from "../types/normalized.js";

export interface ClassificationResult {
  verdict: Verdict;
  origin: FailureOrigin;
  /** Deterministic, evidence-grounded reason string. Never speculative. */
  reason: string;
  /** The test (if any) whose evidence determined the verdict. */
  determiningTest: NormalizedTestOutcome | null;
}

/**
 * Priority-ordered mapping from a failing test's evidence category to a
 * verdict. Earliest-index failing test in test order determines the
 * overall verdict for that category — this mirrors conventional online
 * judge semantics (first failing test wins) and keeps classification
 * deterministic rather than "worst category across all tests" (which
 * would be ambiguous when categories tie).
 */
function verdictForTestFailure(test: NormalizedTestOutcome): Verdict | null {
  switch (test.failureCategory) {
    case "TIME_LIMIT":
      return "TIME_LIMIT_EXCEEDED";
    case "MEMORY_LIMIT":
      return "MEMORY_LIMIT_EXCEEDED";
    case "OUTPUT_LIMIT":
      return "OUTPUT_LIMIT_EXCEEDED";
    case "RUNTIME_ERROR":
      return "RUNTIME_ERROR";
    case "WRONG_OUTPUT":
    case "EMPTY_OUTPUT":
    case "MALFORMED_OUTPUT":
      return "WRONG_ANSWER";
    default:
      return null;
  }
}

/**
 * Classify a normalized execution result into an authoritative verdict.
 *
 * This function NEVER guesses. Every branch is grounded in a specific
 * evidence field. If evidence is insufficient to support any specific
 * verdict, the result is SYSTEM_ERROR (a platform-failure verdict) rather
 * than a fabricated student-failure verdict.
 *
 * Priority order (highest first):
 *   1. Infrastructure / evaluator failure         -> JUDGE_ERROR / SYSTEM_ERROR
 *   2. Compilation failure                         -> COMPILATION_ERROR
 *   3. Execution-level crash with no per-test data  -> RUNTIME_ERROR / TIME_LIMIT_EXCEEDED / MEMORY_LIMIT_EXCEEDED
 *   4. First failing test's evidence category       -> matching verdict
 *   5. All evaluated tests passed                   -> ACCEPTED
 *   6. Otherwise (evidence insufficient)             -> SYSTEM_ERROR
 */
export function classifyVerdict(result: NormalizedExecutionResult): ClassificationResult {
  // 1. Infrastructure / evaluator failure always takes priority. An infra
  //    failure can never be reinterpreted as a student mistake.
  if (result.infrastructure.hadFailure) {
    const isJudgeOrigin = result.infrastructure.origin === "JUDGE_EVALUATOR";
    return {
      verdict: isJudgeOrigin ? "JUDGE_ERROR" : "SYSTEM_ERROR",
      origin: result.infrastructure.origin ?? "PLATFORM_INFRASTRUCTURE",
      reason: `Platform infrastructure failure detected during evaluation (${result.infrastructure.reasons.join(", ")}). This is not attributable to the submission.`,
      determiningTest: null,
    };
  }

  // 2. Compilation failure.
  if (result.compilation.status === "FAILED") {
    return {
      verdict: "COMPILATION_ERROR",
      origin: "STUDENT_SUBMISSION",
      reason: "The submission failed to compile.",
      determiningTest: null,
    };
  }
  if (result.compilation.status === "UNKNOWN") {
    return {
      verdict: "SYSTEM_ERROR",
      origin: "PLATFORM_INFRASTRUCTURE",
      reason: "Compilation status could not be determined from execution evidence.",
      determiningTest: null,
    };
  }

  // 3. Execution-level crash with no per-test breakdown (e.g. the whole run
  //    was killed before any test outcome was recorded).
  if (result.tests.length === 0 || result.testAggregate.completed === 0) {
    if (result.resources.violations.time) {
      return {
        verdict: "TIME_LIMIT_EXCEEDED",
        origin: "STUDENT_SUBMISSION",
        reason: "Execution exceeded the configured time limit before any test could complete.",
        determiningTest: null,
      };
    }
    if (result.resources.violations.memory) {
      return {
        verdict: "MEMORY_LIMIT_EXCEEDED",
        origin: "STUDENT_SUBMISSION",
        reason: "Execution exceeded the configured memory limit before any test could complete.",
        determiningTest: null,
      };
    }
    if (result.resources.violations.output) {
      return {
        verdict: "OUTPUT_LIMIT_EXCEEDED",
        origin: "STUDENT_SUBMISSION",
        reason: "Execution produced more output than the configured limit allows.",
        determiningTest: null,
      };
    }
    if (result.runtime.status === "CRASHED") {
      return {
        verdict: "RUNTIME_ERROR",
        origin: "STUDENT_SUBMISSION",
        reason: describeRuntimeFailure(result),
        determiningTest: null,
      };
    }
    // No tests, no violations, no crash, no infra failure, no compile error:
    // insufficient evidence to support any verdict.
    return {
      verdict: "SYSTEM_ERROR",
      origin: "PLATFORM_INFRASTRUCTURE",
      reason: "No test outcomes or execution status evidence was available to determine a verdict.",
      determiningTest: null,
    };
  }

  // 4. Walk tests in order; the first non-passed test with evidence determines the verdict.
  for (const test of result.tests) {
    if (test.status === "PASSED") continue;
    if (test.status === "SKIPPED" || test.status === "NOT_EXECUTED") continue;

    const verdict = verdictForTestFailure(test);
    if (verdict) {
      return {
        verdict,
        origin: "STUDENT_SUBMISSION",
        reason: describeTestFailure(test, verdict),
        determiningTest: test,
      };
    }

    if (test.status === "ERROR") {
      // Test reported an error but no failure category was supplied — this
      // is missing evidence, not a confirmed student failure.
      return {
        verdict: "SYSTEM_ERROR",
        origin: "PLATFORM_INFRASTRUCTURE",
        reason: `Test ${test.testId} reported an error with no failure-category evidence attached.`,
        determiningTest: test,
      };
    }

    // status === "FAILED" but failureCategory missing/unrecognized.
    return {
      verdict: "SYSTEM_ERROR",
      origin: "PLATFORM_INFRASTRUCTURE",
      reason: `Test ${test.testId} was marked FAILED without a recognized failure-category evidence field.`,
      determiningTest: test,
    };
  }

  // 5. All evaluated tests passed.
  if (result.testAggregate.passed > 0 && result.testAggregate.failed === 0 && result.testAggregate.errored === 0) {
    return {
      verdict: "ACCEPTED",
      origin: "STUDENT_SUBMISSION",
      reason: "Execution completed successfully and all evaluated test cases produced correct output.",
      determiningTest: null,
    };
  }

  // 6. Fallback — should be unreachable given the branches above, but never
  //    silently default to a student-failure verdict.
  return {
    verdict: "SYSTEM_ERROR",
    origin: "PLATFORM_INFRASTRUCTURE",
    reason: "Execution evidence was insufficient to reach a deterministic verdict.",
    determiningTest: null,
  };
}

function describeTestFailure(test: NormalizedTestOutcome, verdict: Verdict): string {
  switch (verdict) {
    case "TIME_LIMIT_EXCEEDED":
      return `Test case exceeded the configured time limit.`;
    case "MEMORY_LIMIT_EXCEEDED":
      return `Test case exceeded the configured memory limit.`;
    case "OUTPUT_LIMIT_EXCEEDED":
      return `Test case produced more output than permitted.`;
    case "RUNTIME_ERROR":
      return `Execution crashed while running a test case.`;
    case "WRONG_ANSWER":
      return `Execution completed successfully, but the evaluated output did not match the expected result.`;
    default:
      return `Test case did not pass.`;
  }
}

function describeRuntimeFailure(result: NormalizedExecutionResult): string {
  const category = result.runtime.failureCategory;
  switch (category) {
    case "SEGMENTATION_FAULT":
      return "The program terminated due to a segmentation fault.";
    case "STACK_OVERFLOW":
      return "The program terminated due to a stack overflow.";
    case "ABORT":
      return "The program terminated via an abort signal.";
    case "SIGNAL_TERMINATION":
      return `The program was terminated by signal ${result.runtime.signal ?? "unknown"}.`;
    case "UNCAUGHT_EXCEPTION":
      return "The program terminated due to an uncaught exception.";
    case "RUNTIME_LIMIT":
      return "The program exceeded a runtime resource limit.";
    default:
      return "The program terminated abnormally during execution.";
  }
}
