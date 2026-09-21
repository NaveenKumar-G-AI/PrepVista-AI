import { describe, expect, it } from "vitest";
import { normalizeExecutionEvidence } from "../src/normalization/normalize.js";
import { classifyVerdict } from "../src/classification/classifyVerdict.js";
import { baseRawEvidence, test } from "./fixtures.js";

function normalizeOrThrow(raw: ReturnType<typeof baseRawEvidence>) {
  const outcome = normalizeExecutionEvidence(raw);
  if (!outcome.ok) throw new Error("fixture failed to normalize: " + JSON.stringify(outcome));
  return outcome.result;
}

describe("classifyVerdict", () => {
  it("classifies all-passed tests as ACCEPTED", () => {
    const result = normalizeOrThrow(baseRawEvidence());
    const c = classifyVerdict(result);
    expect(c.verdict).toBe("ACCEPTED");
    expect(c.origin).toBe("STUDENT_SUBMISSION");
  });

  it("classifies a failed test with WRONG_OUTPUT as WRONG_ANSWER", () => {
    const raw = baseRawEvidence({
      tests: [
        test("t1", "PUBLIC", 0, "PASSED"),
        test("t2", "PUBLIC", 1, "FAILED", "WRONG_OUTPUT"),
        test("t3", "HIDDEN", 2, "NOT_EXECUTED"),
      ],
      scoring: { strategy: "PASS_COUNT", score: 1, maxScore: 3, groups: null },
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("WRONG_ANSWER");
    expect(c.origin).toBe("STUDENT_SUBMISSION");
    expect(c.determiningTest?.testId).toBe("t2");
  });

  it("classifies COMPILATION_ERROR from compilation.status = FAILED", () => {
    const raw = baseRawEvidence({
      compilation: {
        status: "FAILED",
        durationMs: 200,
        error: { compiler: "gcc", line: 12, column: 5, message: "expected ';'", category: "syntax" },
      },
      tests: [],
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("COMPILATION_ERROR");
    expect(c.origin).toBe("STUDENT_SUBMISSION");
  });

  it("classifies a test-level TIME_LIMIT failure as TIME_LIMIT_EXCEEDED", () => {
    const raw = baseRawEvidence({
      tests: [
        test("t1", "PUBLIC", 0, "PASSED"),
        test("t2", "PUBLIC", 1, "FAILED", "TIME_LIMIT"),
      ],
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("TIME_LIMIT_EXCEEDED");
  });

  it("classifies a test-level MEMORY_LIMIT failure as MEMORY_LIMIT_EXCEEDED", () => {
    const raw = baseRawEvidence({
      tests: [test("t1", "PUBLIC", 0, "FAILED", "MEMORY_LIMIT")],
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("MEMORY_LIMIT_EXCEEDED");
  });

  it("classifies a test-level RUNTIME_ERROR failure as RUNTIME_ERROR", () => {
    const raw = baseRawEvidence({
      tests: [test("t1", "PUBLIC", 0, "FAILED", "RUNTIME_ERROR")],
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("RUNTIME_ERROR");
  });

  it("uses the FIRST failing test in order, not the worst category overall", () => {
    const raw = baseRawEvidence({
      tests: [
        test("t1", "PUBLIC", 0, "FAILED", "WRONG_OUTPUT"),
        test("t2", "PUBLIC", 1, "FAILED", "TIME_LIMIT"),
      ],
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("WRONG_ANSWER");
    expect(c.determiningTest?.testId).toBe("t1");
  });

  // --- The critical rule: infrastructure failure is NEVER student failure ---

  it("classifies evaluator crash as JUDGE_ERROR, never WRONG_ANSWER", () => {
    const raw = baseRawEvidence({
      tests: [test("t1", "PUBLIC", 0, "FAILED", "WRONG_OUTPUT")], // even with failing-looking test evidence present
      infrastructure: {
        evaluatorCrashed: true,
        malformedEvaluatorResponse: false,
        sandboxInfrastructureFailure: false,
        databaseFailureDuringEvaluation: false,
        workerCrashed: false,
        queueRetryExhausted: false,
        networkInterruption: false,
      },
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("JUDGE_ERROR");
    expect(c.origin).toBe("JUDGE_EVALUATOR");
  });

  it("classifies database failure during evaluation as SYSTEM_ERROR, never a student verdict", () => {
    const raw = baseRawEvidence({
      infrastructure: {
        evaluatorCrashed: false,
        malformedEvaluatorResponse: false,
        sandboxInfrastructureFailure: false,
        databaseFailureDuringEvaluation: true,
        workerCrashed: false,
        queueRetryExhausted: false,
        networkInterruption: false,
      },
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("SYSTEM_ERROR");
    expect(c.origin).toBe("PLATFORM_INFRASTRUCTURE");
  });

  it("classifies sandbox infra failure as SYSTEM_ERROR even when execution otherwise looks crashed", () => {
    const raw = baseRawEvidence({
      execution: { status: "CRASHED", exitCode: 1, signal: null, terminationReason: "sandbox_lost" },
      infrastructure: {
        evaluatorCrashed: false,
        malformedEvaluatorResponse: false,
        sandboxInfrastructureFailure: true,
        databaseFailureDuringEvaluation: false,
        workerCrashed: false,
        queueRetryExhausted: false,
        networkInterruption: false,
      },
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("SYSTEM_ERROR");
  });

  it("does not fabricate WRONG_ANSWER when a test is marked FAILED with no failure category evidence", () => {
    const raw = baseRawEvidence({
      tests: [test("t1", "PUBLIC", 0, "FAILED", null)],
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("SYSTEM_ERROR");
    expect(c.origin).toBe("PLATFORM_INFRASTRUCTURE");
  });

  it("classifies a whole-run crash with no per-test data using resource violations, not guesswork", () => {
    const raw = baseRawEvidence({
      tests: [],
      execution: { status: "TIMED_OUT", exitCode: null, signal: null, terminationReason: "wall_clock" },
      resources: {
        timeLimitMs: 2000,
        observedWallTimeMs: 2500,
        observedCpuTimeMs: 2400,
        memoryLimitKb: 262144,
        observedPeakMemoryKb: 40000,
        outputLimitBytes: 1048576,
        observedOutputBytes: 0,
        violations: { time: true, memory: false, output: false, process: false },
      },
    });
    const c = classifyVerdict(normalizeOrThrow(raw));
    expect(c.verdict).toBe("TIME_LIMIT_EXCEEDED");
  });
});
