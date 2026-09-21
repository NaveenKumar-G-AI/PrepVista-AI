import { runInSandbox } from "../sandbox/runner";
import type { ComparisonResult } from "./comparators";

/**
 * Special-judge support. The checker is server-authored trusted code
 * (never candidate-supplied), but it still runs inside the sandbox —
 * with its own resource limits — because "trusted" means "the platform
 * wrote it", not "safe to run with no limits at all" (a buggy checker
 * should not be able to hang the judge either; see JUDGE_ERROR handling
 * in lib/engine/verdict.ts).
 *
 * Protocol: the checker receives three lines on stdin —
 *   input_data\n---HTE_SEP---\ncandidate_output\n---HTE_SEP---\nexpected_output
 * and must print exactly "OK" or "WRONG" as its first line of stdout.
 * Anything else is a checker failure (JUDGE_ERROR), never WRONG_ANSWER.
 */
const SEP = "---HTE_SEP---";

export async function runCustomChecker(
  checkerSource: string,
  checkerLanguage: string,
  inputData: string,
  candidateOutput: string,
  expectedOutput: string
): Promise<ComparisonResult & { judgeError?: boolean }> {
  const stdin = [inputData, SEP, candidateOutput, SEP, expectedOutput].join("\n");

  const result = await runInSandbox({
    language: checkerLanguage,
    sourceCode: checkerSource,
    stdin,
    limits: { timeMs: 5000, memoryMb: 256, outputKb: 64, pidsLimit: 16 },
  });

  if (result.outcome !== "ok") {
    return {
      matches: false,
      judgeError: true,
      reason: `checker itself failed: ${result.outcome}`,
    };
  }

  const firstLine = result.stdout.trim().split("\n")[0]?.trim();
  if (firstLine === "OK") return { matches: true };
  if (firstLine === "WRONG") return { matches: false, reason: "checker reported WRONG" };

  return {
    matches: false,
    judgeError: true,
    reason: `checker produced an unrecognized verdict line: ${JSON.stringify(firstLine)}`,
  };
}
