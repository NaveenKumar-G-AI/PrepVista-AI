import { describe, it, expect } from "vitest";
import { decidePolicy } from "../../src/policy/AccuracyTrainingPolicyEngine.js";
import { nextRepairStage, nextDifficulty, pickNextQuestionId } from "../../src/policy/repairLadder.js";
import { computeStability } from "../../src/domain/stability.js";

describe("decidePolicy — §42", () => {
  it("§119 — a recurring error raises priority", () => {
    const decision = decidePolicy({
      errorType: "STRATEGY_ERROR",
      recurrenceStatus: "recurring",
      currentDifficulty: "medium",
      lastAttemptCorrect: false,
      recentCorrectStreak: 0,
      currentRepairStage: null,
      consecutiveCorrectAtCurrentStage: 0,
      stability: computeStability([]),
      targetAccuracyPct: 90
    });
    expect(decision.priorityRaised).toBe(true);
    expect(decision.interventionType).toBe("STRATEGY_SELECTION_DRILL");
  });

  it("§121 — a regressed error routes to reassessment, not straight back into a drill", () => {
    const decision = decidePolicy({
      errorType: "VERIFICATION_ERROR",
      recurrenceStatus: "regressed",
      currentDifficulty: "medium",
      lastAttemptCorrect: false,
      recentCorrectStreak: 0,
      currentRepairStage: null,
      consecutiveCorrectAtCurrentStage: 0,
      stability: computeStability([]),
      targetAccuracyPct: 90
    });
    expect(decision.shouldReassess).toBe(true);
    expect(decision.rationale.toLowerCase()).toContain("reappeared");
  });

  it("§46-47 — a resolved, stable pattern fades toward mixed precision", () => {
    const decision = decidePolicy({
      errorType: "CALCULATION_ERROR",
      recurrenceStatus: "resolved",
      currentDifficulty: "medium",
      lastAttemptCorrect: true,
      recentCorrectStreak: 5,
      currentRepairStage: "INDEPENDENT_PROBLEM",
      consecutiveCorrectAtCurrentStage: 3,
      stability: computeStability([94, 95, 93, 96]),
      targetAccuracyPct: 90
    });
    expect(decision.shouldFadeToMixedPrecision).toBe(true);
  });

  it("does not fade when accuracy is stable but below the target", () => {
    const decision = decidePolicy({
      errorType: "CALCULATION_ERROR",
      recurrenceStatus: "resolved",
      currentDifficulty: "medium",
      lastAttemptCorrect: true,
      recentCorrectStreak: 5,
      currentRepairStage: "INDEPENDENT_PROBLEM",
      consecutiveCorrectAtCurrentStage: 3,
      stability: computeStability([60, 61, 59, 62]),
      targetAccuracyPct: 90
    });
    expect(decision.shouldFadeToMixedPrecision).toBe(false);
  });
});

describe("nextRepairStage — §44", () => {
  it("starts at EXPLAIN", () => {
    expect(nextRepairStage(null, true, 0)).toBe("EXPLAIN");
  });
  it("does not advance on a single correct answer", () => {
    expect(nextRepairStage("EXPLAIN", true, 1)).toBe("EXPLAIN");
  });
  it("advances after two consecutive correct answers at the same stage", () => {
    expect(nextRepairStage("EXPLAIN", true, 2)).toBe("GUIDED_CORRECTION");
  });
  it("steps back one stage (not to zero) after a wrong answer", () => {
    expect(nextRepairStage("STRUCTURAL_VARIATION", false, 0)).toBe("SIMILAR_PROBLEM");
  });
});

describe("nextDifficulty — §45 (no abrupt jumps)", () => {
  it("reduces difficulty by exactly one level on failure", () => {
    expect(nextDifficulty("hard", 0, true)).toEqual({ adjustment: "decrease", next: "medium" });
  });
  it("holds at the floor", () => {
    expect(nextDifficulty("easy", 0, true)).toEqual({ adjustment: "hold", next: "easy" });
  });
  it("increases by one level after a real streak, not a single success", () => {
    expect(nextDifficulty("easy", 1, false)).toEqual({ adjustment: "hold", next: "easy" });
    expect(nextDifficulty("easy", 3, false)).toEqual({ adjustment: "increase", next: "medium" });
  });
});

describe("pickNextQuestionId — §43 (don't immediately repeat)", () => {
  it("prefers a plan question not seen recently", () => {
    expect(pickNextQuestionId(["q1", "q2", "q3"], ["q1"])).toBe("q2");
  });
  it("falls back to a repeat only when nothing else is left", () => {
    expect(pickNextQuestionId(["q1"], ["q1"])).toBe("q1");
  });
});
