import { describe, expect, it } from "vitest";
import { normalizeExecutionEvidence } from "../src/normalization/normalize.js";
import { finalizeResult } from "../src/finalize/finalizeResult.js";
import { toExecutionResultDto, toInternalExecutionResultDto } from "../src/redaction/toDto.js";
import { baseRawEvidence, test } from "./fixtures.js";

function finalizedFrom(raw: ReturnType<typeof baseRawEvidence>) {
  const norm = normalizeExecutionEvidence(raw);
  if (!norm.ok) throw new Error("bad fixture: " + JSON.stringify(norm));
  const fin = finalizeResult(norm.result);
  if (fin.kind !== "FINALIZED") throw new Error("did not finalize");
  return fin;
}

describe("student-facing DTO redaction", () => {
  it("never reveals hidden test identity/status/timing to a student when per-test visibility is not permitted", () => {
    const raw = baseRawEvidence({
      tests: [
        test("public_1", "PUBLIC", 0, "PASSED"),
        test("SECRET_HIDDEN_TEST_37", "HIDDEN", 1, "FAILED", "WRONG_OUTPUT"),
      ],
      scoring: { strategy: "PASS_COUNT", score: 1, maxScore: 2, groups: null },
    });
    const finalized = finalizedFrom(raw);

    const dto = toExecutionResultDto(finalized, { role: "STUDENT", perTestVisibilityAllowed: false });
    const serialized = JSON.stringify(dto);

    expect(serialized).not.toMatch(/SECRET_HIDDEN_TEST_37/);
    expect(dto.tests.rows).toBeNull();
    // Aggregate counts are fine to expose — they don't reveal which hidden test failed.
    expect(dto.tests.total).toBe(2);
    expect(dto.tests.passed).toBe(1);
  });

  it("marks hidden tests as HIDDEN (not their real status) even when per-test rows are shown", () => {
    const raw = baseRawEvidence({
      tests: [
        test("public_1", "PUBLIC", 0, "PASSED"),
        test("SECRET_HIDDEN_TEST_37", "HIDDEN", 1, "FAILED", "WRONG_OUTPUT"),
      ],
    });
    const finalized = finalizedFrom(raw);

    const dto = toExecutionResultDto(finalized, { role: "STUDENT", perTestVisibilityAllowed: true });
    const serialized = JSON.stringify(dto);

    expect(serialized).not.toMatch(/SECRET_HIDDEN_TEST_37/);
    const hiddenRow = dto.tests.rows?.find((r) => r.position === 2);
    expect(hiddenRow?.visible).toBe(false);
    expect(hiddenRow?.status).toBe("HIDDEN");
    expect(hiddenRow?.durationMs).toBeNull();
    expect(hiddenRow?.memoryKb).toBeNull();
  });

  it("uses display position, never the real internal testId, in any student-facing row", () => {
    const raw = baseRawEvidence({
      tests: [test("internal_uuid_abcdef", "PUBLIC", 0, "PASSED")],
    });
    const finalized = finalizedFrom(raw);
    const dto = toExecutionResultDto(finalized, { role: "STUDENT", perTestVisibilityAllowed: true });
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toMatch(/internal_uuid_abcdef/);
    expect(dto.tests.rows?.[0]?.position).toBe(1);
  });

  it("does not include version binding, infra failure reasons, or evaluationId internals in the public DTO shape", () => {
    const raw = baseRawEvidence({
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
    const finalized = finalizedFrom(raw);
    const dto = toExecutionResultDto(finalized, { role: "STUDENT", perTestVisibilityAllowed: false });

    expect((dto as unknown as { versionBinding?: unknown }).versionBinding).toBeUndefined();
    expect((dto as unknown as { infrastructureReasons?: unknown }).infrastructureReasons).toBeUndefined();
    // The message is safe and non-speculative, not raw infra reason codes.
    expect(dto.message).not.toMatch(/evaluatorCrashed/);
    expect(dto.message).toMatch(/not a reflection of your solution/i);
  });

  it("gives instructors/internal evaluators full per-test visibility including hidden test status (but never inputs/outputs, which are never present in the model at all)", () => {
    const raw = baseRawEvidence({
      tests: [test("hidden_1", "HIDDEN", 0, "FAILED", "WRONG_OUTPUT")],
    });
    const finalized = finalizedFrom(raw);
    const dto = toExecutionResultDto(finalized, { role: "INSTRUCTOR", perTestVisibilityAllowed: true });
    expect(dto.tests.rows?.[0]?.visible).toBe(true);
    expect(dto.tests.rows?.[0]?.status).toBe("FAILED");
  });

  it("throws if toInternalExecutionResultDto is called with a non-privileged role (defense in depth against caller bugs)", () => {
    const finalized = finalizedFrom(baseRawEvidence());
    expect(() =>
      toInternalExecutionResultDto(finalized, { role: "STUDENT", perTestVisibilityAllowed: false }),
    ).toThrow();
  });

  it("the internal DTO (for admins) legitimately includes version binding for audit purposes", () => {
    const finalized = finalizedFrom(baseRawEvidence());
    const dto = toInternalExecutionResultDto(finalized, { role: "ADMINISTRATOR", perTestVisibilityAllowed: true });
    expect(dto.versionBinding.problemVersion).toBe("v1");
    expect(dto.resultHash).toHaveLength(64);
  });
});
