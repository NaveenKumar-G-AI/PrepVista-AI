import type { FinalizedExecutionResult, NormalizedTestOutcome } from "../types/normalized.js";
import type { Role } from "../types/enums.js";

/**
 * Public-facing test row. Deliberately excludes anything that could
 * reconstruct a hidden test: no inputs, no expected outputs, no hidden
 * test identifiers, no weights, no checker internals.
 */
export interface PublicTestRow {
  /** 1-based display position, NOT the internal hidden testId. */
  position: number;
  visible: boolean;
  status: NormalizedTestOutcome["status"] | "HIDDEN";
  durationMs: number | null;
  memoryKb: number | null;
}

export interface ExecutionResultDto {
  submissionId: string;
  evaluationId: string;
  verdict: FinalizedExecutionResult["verdict"];
  message: string;
  language: string;
  tests: {
    total: number;
    passed: number;
    /** Only populated when the role/problem configuration permits per-test visibility. */
    rows: PublicTestRow[] | null;
  };
  scoring: {
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
  } | null;
  performance: {
    runtimeMs: number | null;
    memoryKb: number | null;
  };
  compilationError: {
    line: number | null;
    column: number | null;
    message: string | null;
  } | null;
  finalizedAtIso: string;
}

/** Internal-only DTO for internal evaluators / admins performing operational triage. */
export interface InternalExecutionResultDto extends ExecutionResultDto {
  versionBinding: FinalizedExecutionResult["result"]["versionBinding"];
  infrastructureReasons: string[];
  resultHash: string;
}

export interface RedactionContext {
  role: Role;
  /** True when the problem configuration permits showing per-test pass/fail to this role. */
  perTestVisibilityAllowed: boolean;
}

function safeMessage(finalized: FinalizedExecutionResult): string {
  const { verdict, result } = finalized;
  switch (verdict) {
    case "ACCEPTED":
      return "All evaluated test cases passed.";
    case "WRONG_ANSWER":
      return `Execution completed successfully, but ${result.testAggregate.failed} evaluated test case(s) produced incorrect output.`;
    case "COMPILATION_ERROR":
      return "The submission failed to compile.";
    case "RUNTIME_ERROR":
      return "The program crashed during execution.";
    case "TIME_LIMIT_EXCEEDED":
      return "The program exceeded the configured time limit.";
    case "MEMORY_LIMIT_EXCEEDED":
      return "The program exceeded the configured memory limit.";
    case "OUTPUT_LIMIT_EXCEEDED":
      return "The program produced more output than permitted.";
    case "SYSTEM_ERROR":
      return "A platform error occurred while evaluating this submission. This is not a reflection of your solution; the evaluation will be retried.";
    case "JUDGE_ERROR":
      return "The judge was unable to complete evaluation due to an internal error. This is not a reflection of your solution.";
  }
}

/**
 * Build the safe, role-appropriate DTO from a finalized result. This is
 * the ONLY sanctioned path from internal evidence to anything that leaves
 * the server (REST response, realtime event, or frontend prop).
 */
export function toExecutionResultDto(
  finalized: FinalizedExecutionResult,
  ctx: RedactionContext,
): ExecutionResultDto {
  const { result } = finalized;

  const showPerTestRows = ctx.perTestVisibilityAllowed || ctx.role !== "STUDENT";

  const rows: PublicTestRow[] | null = showPerTestRows
    ? result.tests.map((t, idx) => {
        const isVisibleToRole = t.visibility === "PUBLIC" || ctx.role !== "STUDENT";
        return {
          position: idx + 1,
          visible: isVisibleToRole,
          status: isVisibleToRole ? t.status : "HIDDEN",
          durationMs: isVisibleToRole ? t.durationMs : null,
          memoryKb: isVisibleToRole ? t.memoryKb : null,
        };
      })
    : null;

  // Compiler diagnostics are safe to show (they describe the student's own
  // code) but must never leak filesystem paths. We trust the compiler
  // evidence's `message` field was already sanitized upstream by the
  // execution engine; this layer does not attempt secondary path-stripping
  // since it cannot safely distinguish a legitimate path-shaped identifier
  // in student output from a real filesystem path.
  const compilationError =
    result.compilation.status === "FAILED" && result.compilation.error
      ? {
          line: result.compilation.error.line,
          column: result.compilation.error.column,
          message: result.compilation.error.message,
        }
      : null;

  return {
    submissionId: finalized.submissionId,
    evaluationId: finalized.evaluationId,
    verdict: finalized.verdict,
    message: safeMessage(finalized),
    language: result.language,
    tests: {
      total: result.testAggregate.total,
      passed: result.testAggregate.passed,
      rows,
    },
    scoring: result.scoring.score !== null
      ? { score: result.scoring.score, maxScore: result.scoring.maxScore, percentage: result.scoring.percentage }
      : null,
    performance: {
      runtimeMs: result.resources.observedWallTimeMs,
      memoryKb: result.resources.observedPeakMemoryKb,
    },
    compilationError,
    finalizedAtIso: finalized.finalizedAtIso,
  };
}

/** Only for INTERNAL_EVALUATOR / ADMINISTRATOR roles — enforce at the API layer before calling this. */
export function toInternalExecutionResultDto(
  finalized: FinalizedExecutionResult,
  ctx: RedactionContext,
): InternalExecutionResultDto {
  if (ctx.role !== "INTERNAL_EVALUATOR" && ctx.role !== "ADMINISTRATOR") {
    throw new Error("toInternalExecutionResultDto called with a non-privileged role; this is a caller bug.");
  }
  const base = toExecutionResultDto(finalized, { ...ctx, perTestVisibilityAllowed: true });
  return {
    ...base,
    versionBinding: finalized.result.versionBinding,
    infrastructureReasons: finalized.result.infrastructure.reasons,
    resultHash: finalized.resultHash,
  };
}
