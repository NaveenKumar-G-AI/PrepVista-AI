import { describe, expect, it } from "vitest";
import { normalizeExecutionEvidence } from "../src/normalization/normalize.js";
import { baseRawEvidence, test } from "./fixtures.js";

describe("normalizeExecutionEvidence", () => {
  it("normalizes a well-formed payload", () => {
    const outcome = normalizeExecutionEvidence(baseRawEvidence());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.submissionId).toBe("sub_1");
      expect(outcome.result.testAggregate).toEqual({
        total: 3,
        passed: 3,
        failed: 0,
        errored: 0,
        skipped: 0,
        notExecuted: 0,
        completed: 3,
      });
      expect(outcome.result.completeness.isComplete).toBe(true);
    }
  });

  it("rejects a schema-invalid payload without throwing", () => {
    const bad = { not: "a valid payload" };
    const outcome = normalizeExecutionEvidence(bad);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("SCHEMA_VALIDATION_FAILED");
      expect(outcome.issues?.length).toBeGreaterThan(0);
    }
  });

  it("rejects a payload with completed > required (internal inconsistency)", () => {
    const raw = baseRawEvidence({ requiredEvaluationCount: 3, completedEvaluationCount: 5 });
    const outcome = normalizeExecutionEvidence(raw);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("INTERNALLY_INCONSISTENT");
      expect(outcome.issues?.join(" ")).toMatch(/completedEvaluationCount exceeds/);
    }
  });

  it("rejects duplicate test IDs in the same payload", () => {
    const raw = baseRawEvidence({
      tests: [test("dup", "PUBLIC", 0, "PASSED"), test("dup", "PUBLIC", 1, "PASSED")],
    });
    const outcome = normalizeExecutionEvidence(raw);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.issues?.join(" ")).toMatch(/duplicate testId/);
  });

  it("rejects a time violation flag with no observed wall time (unsupported claim)", () => {
    const raw = baseRawEvidence();
    raw.resources.violations.time = true;
    raw.resources.observedWallTimeMs = null;
    const outcome = normalizeExecutionEvidence(raw);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.issues?.join(" ")).toMatch(/time violation flagged/);
  });

  it("rejects compilation FAILED with no compiler error evidence", () => {
    const raw = baseRawEvidence({ compilation: { status: "FAILED", durationMs: 100, error: null } });
    const outcome = normalizeExecutionEvidence(raw);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.issues?.join(" ")).toMatch(/no compiler error evidence/);
  });

  it("sorts tests by declared order regardless of array order", () => {
    const raw = baseRawEvidence({
      tests: [test("second", "PUBLIC", 1, "PASSED"), test("first", "PUBLIC", 0, "PASSED")],
    });
    const outcome = normalizeExecutionEvidence(raw);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.tests.map((t) => t.testId)).toEqual(["first", "second"]);
    }
  });

  it("never fabricates a measurement: null stays null through normalization", () => {
    const raw = baseRawEvidence();
    raw.resources.observedCpuTimeMs = null;
    const outcome = normalizeExecutionEvidence(raw);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.resources.observedCpuTimeMs).toBeNull();
  });
});
