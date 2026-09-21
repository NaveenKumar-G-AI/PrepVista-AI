import type { RawExecutionEvidence, RawTestOutcome } from "../src/types/raw.js";

export function baseRawEvidence(overrides: Partial<RawExecutionEvidence> = {}): RawExecutionEvidence {
  const base: RawExecutionEvidence = {
    submissionId: "sub_1",
    evaluationId: "eval_1",
    problemId: "prob_1",
    problemVersion: "v1",
    testSuiteVersion: "ts_v1",
    checkerVersion: "chk_v1",
    language: "python3",
    runtimeVersion: "3.11",
    compilerVersion: null,
    executionEnvironmentId: "env_v1",

    compilation: { status: "NOT_REQUIRED", durationMs: null, error: null },

    execution: { status: "COMPLETED", exitCode: 0, signal: null, terminationReason: null },

    resources: {
      timeLimitMs: 2000,
      observedWallTimeMs: 420,
      observedCpuTimeMs: 400,
      memoryLimitKb: 262144,
      observedPeakMemoryKb: 38912,
      outputLimitBytes: 1048576,
      observedOutputBytes: 128,
      violations: { time: false, memory: false, output: false, process: false },
    },

    runtimeError: null,

    tests: [
      test("t1", "PUBLIC", 0, "PASSED"),
      test("t2", "PUBLIC", 1, "PASSED"),
      test("t3", "HIDDEN", 2, "PASSED"),
    ],
    requiredEvaluationCount: 3,
    completedEvaluationCount: 3,

    scoring: { strategy: "PASS_COUNT", score: 3, maxScore: 3, groups: null },

    infrastructure: {
      evaluatorCrashed: false,
      malformedEvaluatorResponse: false,
      sandboxInfrastructureFailure: false,
      databaseFailureDuringEvaluation: false,
      workerCrashed: false,
      queueRetryExhausted: false,
      networkInterruption: false,
    },

    evaluatedAtIso: new Date("2026-08-17T10:00:00.000Z").toISOString(),
  };

  return { ...base, ...overrides };
}

export function test(
  testId: string,
  visibility: "PUBLIC" | "HIDDEN",
  order: number,
  status: RawTestOutcome["status"],
  failureCategory: RawTestOutcome["failureCategory"] = null,
  extra: Partial<RawTestOutcome> = {},
): RawTestOutcome {
  return {
    testId,
    visibility,
    order,
    status,
    durationMs: 10,
    memoryKb: 4096,
    terminationReason: null,
    failureCategory,
    ...extra,
  };
}
