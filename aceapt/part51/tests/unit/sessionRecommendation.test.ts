import { describe, it, expect } from "vitest";
import { recommendNextState } from "../../src/services/AccuracyTrainingEngine.js";
import type { AttemptRecord } from "../../src/types/accuracy.js";

function makeAttempt(overrides: Partial<AttemptRecord>): AttemptRecord {
  return {
    id: "a-1",
    studentId: "s-1",
    sessionId: "sess-1",
    questionId: "q-1",
    skillId: "skill-1",
    sequenceNumber: 1,
    isCorrect: true,
    firstErrorStep: null,
    stepResults: null,
    errorType: null,
    difficulty: "medium",
    isNovel: false,
    hintLevel: "guided",
    responseTimeMs: null,
    expectedTimeMs: null,
    selfCorrected: false,
    questionValid: true,
    sessionPositionPct: 50,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe("recommendNextState", () => {
  it("recommends RETRY after an incorrect (valid) attempt", () => {
    const last = makeAttempt({ isCorrect: false });
    expect(recommendNextState({ questionPlan: ["q1", "q2"], mode: "guided" }, last, [last])).toBe("RETRY");
  });

  it("recommends ACTIVE when the plan has more questions left", () => {
    const last = makeAttempt({ isCorrect: true });
    expect(recommendNextState({ questionPlan: ["q1", "q2", "q3"], mode: "guided" }, last, [last])).toBe("ACTIVE");
  });

  it("recommends VERIFICATION when the guided plan is exhausted with no independent attempt yet", () => {
    const attempts = [makeAttempt({ isCorrect: true }), makeAttempt({ isCorrect: true })];
    const last = attempts[attempts.length - 1]!;
    expect(recommendNextState({ questionPlan: ["q1", "q2"], mode: "guided" }, last, attempts)).toBe("VERIFICATION");
  });

  it("recommends COMPLETED once an independent attempt has been recorded and the plan is exhausted", () => {
    const attempts = [
      makeAttempt({ isCorrect: true, hintLevel: "guided" }),
      makeAttempt({ isCorrect: true, hintLevel: "independent" })
    ];
    const last = attempts[attempts.length - 1]!;
    expect(recommendNextState({ questionPlan: ["q1", "q2"], mode: "guided" }, last, attempts)).toBe("COMPLETED");
  });

  it("recommends COMPLETED for an independent-mode session as soon as the plan is exhausted", () => {
    const attempts = [makeAttempt({ isCorrect: true })];
    const last = attempts[0]!;
    expect(recommendNextState({ questionPlan: ["q1"], mode: "independent" }, last, attempts)).toBe("COMPLETED");
  });

  it("§129 — an incorrect attempt on an invalid question does not trigger a retry loop", () => {
    const last = makeAttempt({ isCorrect: false, questionValid: false });
    expect(recommendNextState({ questionPlan: ["q1", "q2"], mode: "guided" }, last, [last])).toBe("ACTIVE");
  });
});
