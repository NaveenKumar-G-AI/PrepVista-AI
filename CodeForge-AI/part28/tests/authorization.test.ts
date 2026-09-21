import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveAuthorizedStudentId, applyAssessmentModeFilter, redactSnapshotForAssessment } from "../src/lib/growth/authorization.ts";
import type { GrowthInsight, GrowthSnapshot } from "../src/lib/growth/types.ts";

describe("resolveAuthorizedStudentId", () => {
  test("no session => UNAUTHENTICATED", () => {
    const result = resolveAuthorizedStudentId(null, null, () => true);
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "UNAUTHENTICATED");
  });

  test("a student reading their own data (no studentId requested) is authorized", () => {
    const result = resolveAuthorizedStudentId({ userId: "s1", isInstructor: false }, null, () => false);
    assert.deepEqual(result, { ok: true, studentId: "s1", asInstructor: false });
  });

  test("a student explicitly requesting their own id is authorized", () => {
    const result = resolveAuthorizedStudentId({ userId: "s1", isInstructor: false }, "s1", () => false);
    assert.equal(result.ok, true);
  });

  test("student A requesting student B's data is FORBIDDEN, even though B is a valid id", () => {
    const result = resolveAuthorizedStudentId({ userId: "s1", isInstructor: false }, "s2", () => true /* even if the check would say yes, non-instructors never get this far */);
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "FORBIDDEN");
  });

  test("an instructor requesting an ENROLLED student is authorized as instructor", () => {
    const result = resolveAuthorizedStudentId({ userId: "instructor_1", isInstructor: true }, "s2", (instructorId, studentId) => instructorId === "instructor_1" && studentId === "s2");
    assert.deepEqual(result, { ok: true, studentId: "s2", asInstructor: true });
  });

  test("an instructor requesting an UNENROLLED student is FORBIDDEN — the enrollment check is authoritative, not the isInstructor flag alone", () => {
    const result = resolveAuthorizedStudentId({ userId: "instructor_1", isInstructor: true }, "s_not_mine", () => false);
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "FORBIDDEN");
  });
});

describe("applyAssessmentModeFilter", () => {
  test("drops insights not marked assessmentSafe", () => {
    const insights = [
      { assessmentSafe: true } as GrowthInsight,
      { assessmentSafe: false } as GrowthInsight,
    ];
    assert.equal(applyAssessmentModeFilter(insights).length, 1);
  });
});

describe("redactSnapshotForAssessment", () => {
  test("strips evidence drill-down ids from every dimension", () => {
    const snapshot = {
      dimensions: [{ supportingEvidenceIds: ["e1", "e2"] }, { supportingEvidenceIds: ["e3"] }],
    } as unknown as GrowthSnapshot;
    const redacted = redactSnapshotForAssessment(snapshot);
    assert.ok(redacted.dimensions.every((d) => d.supportingEvidenceIds.length === 0));
  });
});
