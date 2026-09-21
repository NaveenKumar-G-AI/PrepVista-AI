import type { CompilationStatus, ExecutionStatus, TestStatus } from "./enums.js";

/**
 * RawExecutionEvidence is the untrusted, executor-shaped payload as it
 * arrives from the existing sandbox/execution engine. It is NOT consumed
 * directly by the rest of CodeForge — it must pass through
 * `normalizeExecutionEvidence()` first (see src/normalization/normalize.ts).
 *
 * Every measurement is explicitly nullable. Absence of a measurement is
 * represented as `null`, never fabricated as 0 or omitted silently.
 */
export interface RawExecutionEvidence {
  // --- Identity & binding (immutable evidence anchor) ---
  submissionId: string;
  evaluationId: string;
  problemId: string;
  problemVersion: string;
  testSuiteVersion: string;
  checkerVersion: string;
  language: string;
  runtimeVersion: string | null;
  compilerVersion: string | null;
  executionEnvironmentId: string;

  // --- Compilation ---
  compilation: {
    status: CompilationStatus;
    durationMs: number | null;
    error: {
      compiler: string | null;
      line: number | null;
      column: number | null;
      message: string | null;
      category: string | null;
    } | null;
  };

  // --- Execution-level status ---
  execution: {
    status: ExecutionStatus;
    exitCode: number | null;
    signal: string | null;
    terminationReason: string | null;
  };

  // --- Resource usage & configured limits ---
  resources: {
    timeLimitMs: number | null;
    observedWallTimeMs: number | null;
    observedCpuTimeMs: number | null;
    memoryLimitKb: number | null;
    observedPeakMemoryKb: number | null;
    outputLimitBytes: number | null;
    observedOutputBytes: number | null;
    violations: {
      time: boolean;
      memory: boolean;
      output: boolean;
      process: boolean;
    };
  };

  // --- Runtime error evidence (only populated when execution actually crashed) ---
  runtimeError: {
    category:
      | "UNCAUGHT_EXCEPTION"
      | "SEGMENTATION_FAULT"
      | "ABORT"
      | "STACK_OVERFLOW"
      | "SIGNAL_TERMINATION"
      | "RUNTIME_LIMIT"
      | "UNKNOWN_RUNTIME_FAILURE"
      | null;
    message: string | null;
  } | null;

  // --- Test outcomes ---
  tests: RawTestOutcome[];
  requiredEvaluationCount: number;
  completedEvaluationCount: number;

  // --- Scoring, if the host problem uses partial/group scoring. Opaque passthrough. ---
  scoring: {
    strategy: "PASS_COUNT" | "WEIGHTED_GROUPS" | null;
    score: number | null;
    maxScore: number | null;
    groups: Array<{ groupId: string; passed: boolean; weight: number }> | null;
  };

  // --- Infrastructure / evaluator health ---
  infrastructure: {
    evaluatorCrashed: boolean;
    malformedEvaluatorResponse: boolean;
    sandboxInfrastructureFailure: boolean;
    databaseFailureDuringEvaluation: boolean;
    workerCrashed: boolean;
    queueRetryExhausted: boolean;
    networkInterruption: boolean;
  };

  evaluatedAtIso: string;
}

export interface RawTestOutcome {
  testId: string;
  visibility: "PUBLIC" | "HIDDEN";
  order: number;
  status: TestStatus;
  durationMs: number | null;
  memoryKb: number | null;
  terminationReason: string | null;
  failureCategory:
    | "WRONG_OUTPUT"
    | "TIME_LIMIT"
    | "MEMORY_LIMIT"
    | "OUTPUT_LIMIT"
    | "RUNTIME_ERROR"
    | "EMPTY_OUTPUT"
    | "MALFORMED_OUTPUT"
    | null;
}
