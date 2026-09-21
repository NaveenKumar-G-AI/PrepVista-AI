import { describe, it, expect } from "vitest";
import { scoreSession } from "../engine/scoring.js";
import type { EngineQuestion, EngineResponse } from "../engine/types.js";

const marking = { correct: 1, wrong: -0.25, skip: 0 };

function q(id: string, correctIndex: number): EngineQuestion {
  return { id, sequenceIndex: 0, concept: "X", difficulty: "Easy", correctIndex };
}

function r(questionId: string, selectedIndex: number | null): EngineResponse {
  return {
    questionId,
    status: selectedIndex === null ? "viewed" : "answered",
    selectedIndex,
    markedForReview: false,
    timeSpentMs: 1000,
    visits: 1,
  };
}

describe("scoreSession", () => {
  it("applies +1 / -0.25 / 0 marking correctly", () => {
    const questions = [q("a", 0), q("b", 0), q("c", 0), q("d", 0), q("e", 0), q("f", 0)];
    const responses = new Map<string, EngineResponse>([
      ["a", r("a", 0)], // correct
      ["b", r("b", 0)], // correct
      ["c", r("c", 0)], // correct
      ["d", r("d", 1)], // wrong
      ["e", r("e", 1)], // wrong
      ["f", r("f", null)], // skipped
    ]);
    const result = scoreSession(questions, responses, marking);
    expect(result.correctCount).toBe(3);
    expect(result.wrongCount).toBe(2);
    expect(result.unattemptedCount).toBe(1);
    expect(result.score).toBeCloseTo(3 * 1 + 2 * -0.25 + 0, 5);
    expect(result.maxScore).toBe(6);
  });

  it("treats a missing response the same as unattempted", () => {
    const questions = [q("a", 0)];
    const responses = new Map<string, EngineResponse>();
    const result = scoreSession(questions, responses, marking);
    expect(result.unattemptedCount).toBe(1);
    expect(result.score).toBe(0);
  });

  it("scores a perfect run at exactly maxScore", () => {
    const questions = [q("a", 2), q("b", 1)];
    const responses = new Map<string, EngineResponse>([
      ["a", r("a", 2)],
      ["b", r("b", 1)],
    ]);
    const result = scoreSession(questions, responses, marking);
    expect(result.score).toBe(result.maxScore);
  });

  it("never lets negative marking push a fully-skipped test below zero unfairly (skip = 0)", () => {
    const questions = [q("a", 0), q("b", 0)];
    const responses = new Map<string, EngineResponse>([
      ["a", r("a", null)],
      ["b", r("b", null)],
    ]);
    const result = scoreSession(questions, responses, marking);
    expect(result.score).toBe(0);
  });
});
