import { describe, it, expect } from "vitest";
import { classifyDecision } from "../engine/decisionClassifier.js";

const avg = 60; // seconds

describe("classifyDecision", () => {
  it("labels an untouched question as Not Reached", () => {
    expect(classifyDecision({ attempted: false, correct: false, timeSec: 0, difficulty: "Easy" }, avg)).toBe(
      "Not Reached"
    );
  });

  it("labels skipping an Easy/Medium question after viewing it as Bad Skip", () => {
    expect(classifyDecision({ attempted: false, correct: false, timeSec: 20, difficulty: "Medium" }, avg)).toBe(
      "Bad Skip"
    );
  });

  it("labels skipping a Hard/Very Hard question as Good Skip", () => {
    expect(classifyDecision({ attempted: false, correct: false, timeSec: 20, difficulty: "Hard" }, avg)).toBe(
      "Good Skip"
    );
  });

  it("labels a long deliberation before skipping as Late Skip regardless of difficulty", () => {
    expect(classifyDecision({ attempted: false, correct: false, timeSec: 100, difficulty: "Hard" }, avg)).toBe(
      "Late Skip"
    );
  });

  it("labels a correct answer that took far too long as Overinvestment", () => {
    expect(classifyDecision({ attempted: true, correct: true, timeSec: 200, difficulty: "Medium" }, avg)).toBe(
      "Overinvestment"
    );
  });

  it("labels a fast correct answer as Efficient Solve", () => {
    expect(classifyDecision({ attempted: true, correct: true, timeSec: 20, difficulty: "Easy" }, avg)).toBe(
      "Efficient Solve"
    );
  });

  it("labels a normally-paced correct answer as Good Attempt", () => {
    expect(classifyDecision({ attempted: true, correct: true, timeSec: 55, difficulty: "Medium" }, avg)).toBe(
      "Good Attempt"
    );
  });

  it("labels a wrong answer reached too fast as Premature Guess", () => {
    expect(classifyDecision({ attempted: true, correct: false, timeSec: 10, difficulty: "Hard" }, avg)).toBe(
      "Premature Guess"
    );
  });

  it("labels a wrong answer that consumed excessive time as Overinvestment", () => {
    expect(classifyDecision({ attempted: true, correct: false, timeSec: 150, difficulty: "Hard" }, avg)).toBe(
      "Overinvestment"
    );
  });

  it("labels a normally-paced wrong answer as Good Attempt (an honest miss, not a process failure)", () => {
    expect(classifyDecision({ attempted: true, correct: false, timeSec: 55, difficulty: "Medium" }, avg)).toBe(
      "Good Attempt"
    );
  });
});
