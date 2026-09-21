import { describe, expect, it } from "vitest";
import { scoreSimulation } from "../scoringEngine.js";

const rules = { correctMarks: 1, unansweredMarks: 0 };

describe("scoreSimulation", () => {
  it("scores a perfect run at full marks", () => {
    const attempts = Array.from({ length: 10 }, () => ({ isCorrect: true, finalStatus: "answered" as const, weight: 1 }));
    const result = scoreSimulation(attempts, rules, { enabled: false, penaltyFraction: 0 });
    expect(result.totalScore).toBe(10);
    expect(result.maxScore).toBe(10);
    expect(result.accuracy).toBe(1);
  });

  it("applies negative marking only to wrong answers, never to unanswered ones", () => {
    const attempts = [
      { isCorrect: true, finalStatus: "answered" as const, weight: 1 },
      { isCorrect: false, finalStatus: "answered" as const, weight: 1 },
      { isCorrect: null, finalStatus: "unanswered" as const, weight: 1 },
    ];
    const result = scoreSimulation(attempts, rules, { enabled: true, penaltyFraction: 0.25 });
    expect(result.totalScore).toBeCloseTo(1 - 0.25, 5);
    expect(result.answeredCount).toBe(2);
  });

  it("computes accuracy as correct / answered, not correct / total", () => {
    const attempts = [
      { isCorrect: true, finalStatus: "answered" as const, weight: 1 },
      { isCorrect: null, finalStatus: "unanswered" as const, weight: 1 },
      { isCorrect: null, finalStatus: "unanswered" as const, weight: 1 },
    ];
    const result = scoreSimulation(attempts, rules, { enabled: false, penaltyFraction: 0 });
    expect(result.accuracy).toBe(1); // 1/1, not 1/3
  });

  it("handles a zero-question simulation without dividing by zero", () => {
    const result = scoreSimulation([], rules, { enabled: false, penaltyFraction: 0 });
    expect(result.accuracy).toBe(0);
    expect(result.maxScore).toBe(0);
  });

  it("respects per-question weight", () => {
    const attempts = [
      { isCorrect: true, finalStatus: "answered" as const, weight: 2 },
      { isCorrect: true, finalStatus: "answered" as const, weight: 1 },
    ];
    const result = scoreSimulation(attempts, rules, { enabled: false, penaltyFraction: 0 });
    expect(result.maxScore).toBe(3);
    expect(result.totalScore).toBe(3);
  });
});
