import { describe, expect, it } from "vitest";
import { buildFingerprint, classifyFailure, determineReproductionStatus } from "../src/debugging/fingerprint.js";
import type { ExecutionResult } from "../src/sandbox/executor.js";

function exec(overrides: Partial<ExecutionResult>): ExecutionResult {
  return { stdout: "", stderr: "", exitCode: 0, timedOut: false, killedReason: null, durationMs: 10, truncatedOutput: false, ...overrides };
}

describe("classifyFailure", () => {
  it("returns null when output matches expected (no failure to report)", () => {
    expect(classifyFailure(exec({ stdout: "42\n" }), "42")).toBeNull();
  });

  it("classifies TIME_LIMIT from killedReason, not from duration alone", () => {
    expect(classifyFailure(exec({ killedReason: "wall_time", timedOut: true }), "42")).toBe("TIME_LIMIT");
  });

  it("classifies MEMORY_LIMIT from killedReason", () => {
    expect(classifyFailure(exec({ killedReason: "memory" }), "42")).toBe("MEMORY_LIMIT");
  });

  it("classifies RUNTIME_ERROR from a nonzero exit code", () => {
    expect(classifyFailure(exec({ exitCode: 1, stderr: "Traceback...\nZeroDivisionError: division by zero" }), null)).toBe("RUNTIME_ERROR");
  });

  it("classifies WRONG_ANSWER when output mismatches expected with no other context", () => {
    expect(classifyFailure(exec({ stdout: "41\n" }), "42")).toBe("WRONG_ANSWER");
  });

  it("classifies EDGE_CASE_FAILURE only when the caller flags the input as an edge case", () => {
    expect(classifyFailure(exec({ stdout: "41\n" }), "42", { isEdgeCaseInput: true })).toBe("EDGE_CASE_FAILURE");
  });

  it("classifies REGRESSION only when the caller flags a previously-passing baseline", () => {
    expect(classifyFailure(exec({ stdout: "41\n" }), "42", { isRegressionOfPreviouslyPassing: true })).toBe("REGRESSION");
  });

  it("never invents LOGIC_ERROR from a single execution result", () => {
    // LOGIC_ERROR is a root-cause-level characterization (see rootCause.ts),
    // not something classifyFailure should ever emit on its own.
    const classes = new Set<string | null>();
    classes.add(classifyFailure(exec({ stdout: "41\n" }), "42"));
    classes.add(classifyFailure(exec({ exitCode: 1 }), null));
    classes.add(classifyFailure(exec({ killedReason: "wall_time" }), null));
    expect(classes.has("LOGIC_ERROR" as any)).toBe(false);
  });
});

describe("buildFingerprint", () => {
  it("returns null when there is no failure to fingerprint", () => {
    const fp = buildFingerprint({ id: "f1", sessionId: "s1", input: "5", expectedOutput: "5", execution: exec({ stdout: "5\n" }), runtime: "python" });
    expect(fp).toBeNull();
  });

  it("extracts source location and error message from a python traceback", () => {
    const stderr = 'Traceback (most recent call last):\n  File "main.py", line 7, in calculateWindow\n    raise ValueError("bad")\nValueError: bad';
    const fp = buildFingerprint({
      id: "f2",
      sessionId: "s1",
      input: "5",
      expectedOutput: null,
      execution: exec({ exitCode: 1, stderr }),
      runtime: "python"
    });
    expect(fp?.failureType).toBe("RUNTIME_ERROR");
    expect(fp?.sourceLocation).toEqual({ file: "main.py", line: 7, function: "calculateWindow" });
    expect(fp?.errorMessage).toBe("ValueError: bad");
  });

  it("leaves memoryUsageKB null rather than estimating it (not measured by this executor)", () => {
    const fp = buildFingerprint({ id: "f3", sessionId: "s1", input: "1", expectedOutput: "2", execution: exec({ stdout: "1\n" }), runtime: "python" });
    expect(fp?.memoryUsageKB).toBeNull();
  });
});

describe("determineReproductionStatus", () => {
  it("is REPRODUCED when both runs agree on the failure class", () => {
    expect(determineReproductionStatus("WRONG_ANSWER", "WRONG_ANSWER")).toBe("REPRODUCED");
  });

  it("is NOT_REPRODUCIBLE when the second run doesn't fail the same way", () => {
    expect(determineReproductionStatus("WRONG_ANSWER", null)).toBe("NOT_REPRODUCIBLE");
    expect(determineReproductionStatus("WRONG_ANSWER", "RUNTIME_ERROR")).toBe("NOT_REPRODUCIBLE");
  });
});
