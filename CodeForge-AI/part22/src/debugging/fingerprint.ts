import type { ExecutionResult } from "../sandbox/executor.js";
import type { FailureClass, FailureFingerprint, ReproductionStatus, SourceLocation, SupportedLanguage } from "../types.js";

/**
 * Extra context a caller may know that a single execution result cannot
 * evidence on its own (e.g. "this input is flagged as an edge case in the
 * challenge definition", or "this test used to pass on the last accepted
 * submission"). The classifier never invents these on its own.
 */
export interface ClassificationContext {
  isEdgeCaseInput?: boolean;
  isRegressionOfPreviouslyPassing?: boolean;
  isIntegrationScenario?: boolean;
}

/**
 * Returns the failure class directly evidenced by one execution, or `null`
 * if the execution actually matched the expected output (i.e. no failure).
 *
 * LOGIC_ERROR is intentionally not produced here: "logic error" is a
 * root-cause-level characterization applied once a WRONG_ANSWER's cause is
 * understood (see debugging/rootCause.ts), not something a single
 * stdout/stderr diff can claim on its own.
 */
export function classifyFailure(
  execution: ExecutionResult,
  expectedOutput: string | null,
  ctx: ClassificationContext = {}
): FailureClass | null {
  if (execution.killedReason === "wall_time") return "TIME_LIMIT";
  if (execution.killedReason === "memory") return "MEMORY_LIMIT";

  const crashed = execution.exitCode !== 0 && execution.exitCode !== null;
  if (crashed) {
    return ctx.isIntegrationScenario ? "INTEGRATION_ERROR" : "RUNTIME_ERROR";
  }

  if (expectedOutput !== null) {
    const matches = normalizeOutput(execution.stdout) === normalizeOutput(expectedOutput);
    if (!matches) {
      if (ctx.isRegressionOfPreviouslyPassing) return "REGRESSION";
      if (ctx.isEdgeCaseInput) return "EDGE_CASE_FAILURE";
      return "WRONG_ANSWER";
    }
  }

  return null;
}

export function buildFingerprint(args: {
  id: string;
  sessionId: string;
  input: string | null;
  expectedOutput: string | null;
  execution: ExecutionResult;
  runtime: SupportedLanguage;
  sourceLocation?: SourceLocation | null;
  context?: ClassificationContext;
}): FailureFingerprint | null {
  const failureType = classifyFailure(args.execution, args.expectedOutput, args.context);
  if (!failureType) return null;

  return {
    id: args.id,
    sessionId: args.sessionId,
    failureType,
    input: args.input,
    expectedOutput: args.expectedOutput,
    actualOutput: args.execution.stdout.length > 0 ? args.execution.stdout : null,
    errorMessage: extractErrorMessage(args.execution.stderr),
    stackTrace: args.execution.stderr.length > 0 ? args.execution.stderr : null,
    sourceLocation: args.sourceLocation ?? extractSourceLocation(args.execution.stderr, args.runtime),
    runtime: args.runtime,
    executionTimeMs: args.execution.durationMs,
    // Peak RSS isn't captured by the wall-clock/ulimit-based executor in this
    // iteration (ulimit -v bounds address space, it doesn't report usage) -
    // left null rather than estimated. See README "Known Limitations".
    memoryUsageKB: null,
    reproductionStatus: "NOT_ATTEMPTED",
    capturedAt: new Date().toISOString()
  };
}

/** Run the same input twice; a fingerprint is only "reproduced" if both runs agree on the failure class. */
export function determineReproductionStatus(first: FailureClass | null, second: FailureClass | null): ReproductionStatus {
  if (first === null || second === null) return "NOT_REPRODUCIBLE";
  return first === second ? "REPRODUCED" : "NOT_REPRODUCIBLE";
}

function normalizeOutput(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

function extractErrorMessage(stderr: string): string | null {
  if (!stderr.trim()) return null;
  const lines = stderr.trim().split("\n");
  const last = lines[lines.length - 1]?.trim();
  return last && last.length > 0 ? last : null;
}

function extractSourceLocation(stderr: string, runtime: SupportedLanguage): SourceLocation | null {
  if (!stderr.trim()) return null;
  if (runtime === "python") {
    const matches = [...stderr.matchAll(/File "([^"]+)", line (\d+), in (\S+)/g)];
    const last = matches[matches.length - 1];
    if (!last || !last[1] || !last[2] || !last[3]) return null;
    return { file: last[1], line: Number(last[2]), function: last[3] };
  }
  const match = stderr.match(/at (\S+) \(([^:]+):(\d+):(\d+)\)/);
  if (!match || !match[1] || !match[2] || !match[3]) return null;
  return { function: match[1], file: match[2], line: Number(match[3]) };
}
