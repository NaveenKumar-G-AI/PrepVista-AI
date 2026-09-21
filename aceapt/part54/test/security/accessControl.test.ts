import { describe, it, expect } from "vitest";
import { scopeRunForRole, assertNoAnswerLeakage } from "../../src/security/accessControl.js";
import type { ValidationRunResult } from "../../src/contracts/types.js";

function fakeRun(overrides: Partial<ValidationRunResult> = {}): ValidationRunResult {
  return {
    runId: "run-1",
    questionId: "q-1",
    versionId: "q-1-v1",
    versionNumber: 1,
    mode: "STANDARD",
    profile: "PRACTICE_PROFILE",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    results: [
      {
        validator: "MATH_VALIDATOR",
        category: "MATH",
        status: "FAIL",
        severity: "CRITICAL",
        code: "MATH_INVALID",
        message: "declared 125, derived 100",
        evidence: { declaredAnswer: 125, derivedAnswer: 100 },
        validatorVersion: "1.0.0",
        validatedAt: new Date().toISOString(),
        durationMs: 3
      }
    ],
    overallStatus: "INVALID",
    highestSeverity: "CRITICAL",
    blockingCodes: ["MATH_INVALID"],
    eligibility: { practice: false, timed: false, assessment: false },
    contentHash: "sha256:abc",
    validatorVersionSet: { MATH_VALIDATOR: "1.0.0" },
    ...overrides
  };
}

describe("scopeRunForRole", () => {
  it("gives STUDENT only a minimal safe view", () => {
    const view = scopeRunForRole(fakeRun(), "STUDENT");
    expect(view).toEqual({ questionId: "q-1", versionId: "q-1-v1", available: false, message: "This question is temporarily unavailable." });
  });

  it("gives TRAINER the same minimal view as STUDENT", () => {
    const view = scopeRunForRole(fakeRun(), "TRAINER");
    expect(view).not.toHaveProperty("results");
  });

  it("gives REVIEWER/ADMIN/CONTENT_EDITOR/SYSTEM the full run with evidence", () => {
    for (const role of ["REVIEWER", "ADMIN", "CONTENT_EDITOR", "SYSTEM"] as const) {
      const view = scopeRunForRole(fakeRun(), role);
      expect(view).toHaveProperty("results");
      expect((view as ValidationRunResult).results[0]!.evidence.declaredAnswer).toBe(125);
    }
  });

  it("STUDENT sees available:true and a positive message when the question IS eligible", () => {
    const cleanRun = fakeRun({ overallStatus: "VALID", eligibility: { practice: true, timed: true, assessment: true }, blockingCodes: [] });
    const view = scopeRunForRole(cleanRun, "STUDENT", "practice");
    expect(view).toMatchObject({ available: true, message: "This question is available." });
  });

  it("STUDENT sees an updated message (not raw STALE machinery) when the run is stale", () => {
    const staleRun = fakeRun({ overallStatus: "STALE" });
    const view = scopeRunForRole(staleRun, "STUDENT");
    expect((view as { message: string }).message).toBe("This question has been updated and is being re-checked.");
  });
});

describe("assertNoAnswerLeakage", () => {
  it("flags a payload containing answer-key-shaped keys", () => {
    const result = assertNoAnswerLeakage({ declaredAnswer: 125, derivedAnswer: 100 });
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.foundKeys).toEqual(expect.arrayContaining(["declaredAnswer", "derivedAnswer"]));
    }
  });

  it("passes a genuinely minimal public view", () => {
    const publicView = scopeRunForRole(fakeRun(), "STUDENT");
    const result = assertNoAnswerLeakage(publicView);
    expect(result.safe).toBe(true);
  });

  it("still flags leakage if a caller forgets to scope and passes the full run directly", () => {
    const result = assertNoAnswerLeakage(fakeRun());
    expect(result.safe).toBe(false);
  });
});
