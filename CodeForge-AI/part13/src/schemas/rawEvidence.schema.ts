import { z } from "zod";
import { COMPILATION_STATUSES, EXECUTION_STATUSES, TEST_STATUSES } from "../types/enums.js";

const nullableString = z.string().min(1).nullable();
const nullableNumber = z.number().finite().nullable();

const runtimeFailureCategory = z
  .enum([
    "UNCAUGHT_EXCEPTION",
    "SEGMENTATION_FAULT",
    "ABORT",
    "STACK_OVERFLOW",
    "SIGNAL_TERMINATION",
    "RUNTIME_LIMIT",
    "UNKNOWN_RUNTIME_FAILURE",
  ])
  .nullable();

const testFailureCategory = z
  .enum([
    "WRONG_OUTPUT",
    "TIME_LIMIT",
    "MEMORY_LIMIT",
    "OUTPUT_LIMIT",
    "RUNTIME_ERROR",
    "EMPTY_OUTPUT",
    "MALFORMED_OUTPUT",
  ])
  .nullable();

export const rawTestOutcomeSchema = z.object({
  testId: z.string().min(1),
  visibility: z.enum(["PUBLIC", "HIDDEN"]),
  order: z.number().int().nonnegative(),
  status: z.enum(TEST_STATUSES),
  durationMs: nullableNumber,
  memoryKb: nullableNumber,
  terminationReason: nullableString,
  failureCategory: testFailureCategory,
});

export const rawExecutionEvidenceSchema = z.object({
  submissionId: z.string().min(1),
  evaluationId: z.string().min(1),
  problemId: z.string().min(1),
  problemVersion: z.string().min(1),
  testSuiteVersion: z.string().min(1),
  checkerVersion: z.string().min(1),
  language: z.string().min(1),
  runtimeVersion: nullableString,
  compilerVersion: nullableString,
  executionEnvironmentId: z.string().min(1),

  compilation: z.object({
    status: z.enum(COMPILATION_STATUSES),
    durationMs: nullableNumber,
    error: z
      .object({
        compiler: nullableString,
        line: z.number().int().positive().nullable(),
        column: z.number().int().positive().nullable(),
        message: nullableString,
        category: nullableString,
      })
      .nullable(),
  }),

  execution: z.object({
    status: z.enum(EXECUTION_STATUSES),
    exitCode: z.number().int().nullable(),
    signal: nullableString,
    terminationReason: nullableString,
  }),

  resources: z.object({
    timeLimitMs: nullableNumber,
    observedWallTimeMs: nullableNumber,
    observedCpuTimeMs: nullableNumber,
    memoryLimitKb: nullableNumber,
    observedPeakMemoryKb: nullableNumber,
    outputLimitBytes: nullableNumber,
    observedOutputBytes: nullableNumber,
    violations: z.object({
      time: z.boolean(),
      memory: z.boolean(),
      output: z.boolean(),
      process: z.boolean(),
    }),
  }),

  runtimeError: z
    .object({
      category: runtimeFailureCategory,
      message: nullableString,
    })
    .nullable(),

  tests: z.array(rawTestOutcomeSchema),
  requiredEvaluationCount: z.number().int().nonnegative(),
  completedEvaluationCount: z.number().int().nonnegative(),

  scoring: z.object({
    strategy: z.enum(["PASS_COUNT", "WEIGHTED_GROUPS"]).nullable(),
    score: nullableNumber,
    maxScore: nullableNumber,
    groups: z
      .array(z.object({ groupId: z.string().min(1), passed: z.boolean(), weight: z.number() }))
      .nullable(),
  }),

  infrastructure: z.object({
    evaluatorCrashed: z.boolean(),
    malformedEvaluatorResponse: z.boolean(),
    sandboxInfrastructureFailure: z.boolean(),
    databaseFailureDuringEvaluation: z.boolean(),
    workerCrashed: z.boolean(),
    queueRetryExhausted: z.boolean(),
    networkInterruption: z.boolean(),
  }),

  evaluatedAtIso: z.string().datetime(),
});

export type ValidatedRawExecutionEvidence = z.infer<typeof rawExecutionEvidenceSchema>;
