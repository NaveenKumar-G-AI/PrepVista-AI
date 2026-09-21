import { runInSandbox } from "../sandbox/runner";
import { compareOutputs } from "./comparators";
import { runCustomChecker } from "./custom-checker";
import type { TestCaseSpec, TestOutcome, Verdict } from "./types";

export interface CustomCheckerSource {
  source: string;
  language: string;
}

/**
 * The single place that turns (sandbox outcome, comparator result) into
 * a Verdict. This is where "a sandbox failure must not become
 * WRONG_ANSWER" and "a checker failure must not become WRONG_ANSWER"
 * are actually enforced in code, not just stated as a principle.
 */
export async function evaluateTestCase(
  language: string,
  sourceCode: string,
  test: TestCaseSpec,
  customChecker?: CustomCheckerSource
): Promise<TestOutcome> {
  let sandboxResult;
  try {
    sandboxResult = await runInSandbox({
      language,
      sourceCode,
      stdin: test.inputData,
      limits: test.limits,
    });
  } catch (err) {
    // The sandbox call itself threw (should be rare — runInSandbox
    // catches internally and returns 'system_error' — but if the
    // process itself throws, that is unambiguously our fault, not
    // the student's).
    return {
      testCaseId: test.id,
      category: test.category,
      weight: test.weight,
      isPublic: test.isPublic,
      verdict: "JUDGE_ERROR",
      execTimeMs: 0,
      memoryKb: null,
      outputSizeBytes: 0,
      exitCode: null,
      internalNote: `sandbox threw: ${(err as Error).message}`,
    };
  }

  const base = {
    testCaseId: test.id,
    category: test.category,
    weight: test.weight,
    isPublic: test.isPublic,
    execTimeMs: sandboxResult.execTimeMs,
    memoryKb: null as number | null,
    outputSizeBytes: Buffer.byteLength(sandboxResult.stdout, "utf8"),
    exitCode: sandboxResult.exitCode,
  };

  switch (sandboxResult.outcome) {
    case "timeout":
      return { ...base, verdict: "TIME_LIMIT_EXCEEDED", internalNote: "wall-clock limit exceeded" };
    case "memory_exceeded":
      return { ...base, verdict: "MEMORY_LIMIT_EXCEEDED", internalNote: "memory limit exceeded" };
    case "output_exceeded":
      return { ...base, verdict: "OUTPUT_LIMIT_EXCEEDED", internalNote: "output size limit exceeded" };
    case "compile_error":
      return { ...base, verdict: "COMPILATION_ERROR", internalNote: sandboxResult.stderrSummary };
    case "runtime_error":
      return { ...base, verdict: "RUNTIME_ERROR", internalNote: sandboxResult.stderrSummary };
    case "system_error":
      return { ...base, verdict: "JUDGE_ERROR", internalNote: sandboxResult.stderrSummary };
    case "ok":
      break; // fall through to output comparison
    default: {
      const exhaustive: never = sandboxResult.outcome;
      throw new Error(`unhandled sandbox outcome: ${exhaustive}`);
    }
  }

  // Candidate ran to completion within all limits — now, and only now,
  // does the checker get a say. The checker choice comes from the
  // trusted test spec; the candidate never selects or influences it.
  try {
    if (test.checker.kind === "custom") {
      if (!customChecker) {
        throw new Error("test uses a custom checker but no checker source was supplied");
      }
      const result = await runCustomChecker(
        customChecker.source,
        customChecker.language,
        test.inputData,
        sandboxResult.stdout,
        test.expectedOutput
      );
      if (result.judgeError) {
        return { ...base, verdict: "JUDGE_ERROR", internalNote: result.reason ?? "custom checker failed" };
      }
      const verdict: Verdict = result.matches ? "ACCEPTED" : "WRONG_ANSWER";
      return { ...base, verdict, internalNote: combineNote(result.reason, sandboxResult.stderrSummary) };
    }

    const comparison = compareOutputs(sandboxResult.stdout, test.expectedOutput, test.checker);
    const verdict: Verdict = comparison.matches ? "ACCEPTED" : "WRONG_ANSWER";
    return { ...base, verdict, internalNote: combineNote(comparison.reason, sandboxResult.stderrSummary) };
  } catch (err) {
    return {
      ...base,
      verdict: "JUDGE_ERROR",
      internalNote: `checker threw: ${(err as Error).message}`,
    };
  }
}

/** Server-only diagnostic note. Never read by toSafeResult() — see lib/engine/safe-result.ts. */
function combineNote(reason: string | undefined, stderrSummary: string): string {
  const parts = [reason, stderrSummary].filter((p) => p && p.trim().length > 0);
  return parts.join(" | ").slice(0, 2000);
}
