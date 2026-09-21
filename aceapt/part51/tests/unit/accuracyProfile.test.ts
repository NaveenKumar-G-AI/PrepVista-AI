import { describe, it, expect } from "vitest";
import { computeAccuracyResult, computeAccuracyProfile, isUnderPressure } from "../../src/domain/accuracyProfile.js";
import type { AttemptRecord } from "../../src/types/accuracy.js";

let seq = 0;
function attempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  seq++;
  return {
    id: `a-${seq}`,
    studentId: "student-1",
    sessionId: "s-1",
    questionId: `q-${seq}`,
    skillId: "skill-percentages",
    sequenceNumber: seq,
    isCorrect: true,
    firstErrorStep: null,
    stepResults: null,
    errorType: null,
    difficulty: "medium",
    isNovel: false,
    hintLevel: "independent",
    responseTimeMs: null,
    expectedTimeMs: null,
    selfCorrected: false,
    questionValid: true,
    sessionPositionPct: 50,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe("computeAccuracyResult — §15 evidence gating", () => {
  it("reports insufficient evidence rather than fabricating an accuracy number for 0 attempts", () => {
    const result = computeAccuracyResult([], "overall", null);
    expect(result.confidence).toBe("insufficient");
    expect(result.accuracy).toBeNull();
  });

  it("reports insufficient evidence for 1-2 attempts (below the minimum sample)", () => {
    const result = computeAccuracyResult([attempt(), attempt()], "overall", null);
    expect(result.confidence).toBe("insufficient");
    expect(result.accuracy).toBeNull();
  });

  it("computes a real percentage once the minimum sample is met", () => {
    const attempts = [attempt(), attempt(), attempt({ isCorrect: false })];
    const result = computeAccuracyResult(attempts, "overall", null);
    expect(result.confidence).not.toBe("insufficient");
    expect(result.accuracy).toBeCloseTo(66.7, 0);
  });

  it("§129 — invalid questions never contaminate the accuracy calculation", () => {
    const attempts = [
      attempt({ isCorrect: true }),
      attempt({ isCorrect: true }),
      attempt({ isCorrect: true }),
      attempt({ isCorrect: false, questionValid: false }), // should be excluded entirely
      attempt({ isCorrect: false, questionValid: false })
    ];
    const result = computeAccuracyResult(attempts, "overall", null);
    expect(result.sampleSize).toBe(3);
    expect(result.accuracy).toBe(100);
  });

  it("gates independent/timed/novel sub-dimensions separately from the overall sample", () => {
    // 6 total attempts (enough for overall), but only 1 is independent — that
    // sub-dimension must stay null, not report a 100%-or-0% figure off n=1.
    const attempts = [
      attempt({ hintLevel: "guided" }),
      attempt({ hintLevel: "guided" }),
      attempt({ hintLevel: "guided" }),
      attempt({ hintLevel: "guided" }),
      attempt({ hintLevel: "guided" }),
      attempt({ hintLevel: "independent" })
    ];
    const result = computeAccuracyResult(attempts, "overall", null);
    expect(result.accuracy).not.toBeNull();
    expect(result.independentAccuracy).toBeNull();
  });
});

describe("isUnderPressure", () => {
  it("flags an attempt answered well within the expected time as under pressure", () => {
    expect(isUnderPressure({ responseTimeMs: 20000, expectedTimeMs: 40000 })).toBe(true);
  });
  it("does not flag a normal-pace attempt", () => {
    expect(isUnderPressure({ responseTimeMs: 38000, expectedTimeMs: 40000 })).toBe(false);
  });
  it("does not flag when timing data is missing", () => {
    expect(isUnderPressure({ responseTimeMs: null, expectedTimeMs: 40000 })).toBe(false);
  });
});

describe("computeAccuracyProfile — §14 multi-dimensional slicing", () => {
  it("slices accuracy by skill and by difficulty independently", () => {
    const attempts = [
      attempt({ skillId: "percentages", difficulty: "easy", isCorrect: true }),
      attempt({ skillId: "percentages", difficulty: "easy", isCorrect: true }),
      attempt({ skillId: "percentages", difficulty: "easy", isCorrect: true }),
      attempt({ skillId: "probability", difficulty: "hard", isCorrect: false }),
      attempt({ skillId: "probability", difficulty: "hard", isCorrect: false }),
      attempt({ skillId: "probability", difficulty: "hard", isCorrect: true })
    ];
    const profile = computeAccuracyProfile(attempts);
    const percentages = profile.bySkill.find((r) => r.scopeId === "percentages");
    const probability = profile.bySkill.find((r) => r.scopeId === "probability");
    expect(percentages?.accuracy).toBe(100);
    expect(probability?.accuracy).toBeCloseTo(33.3, 0);
  });
});
