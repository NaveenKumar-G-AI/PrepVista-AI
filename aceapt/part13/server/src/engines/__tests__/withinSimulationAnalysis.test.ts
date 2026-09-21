import { describe, expect, it } from "vitest";
import {
  analyzeEndOfAssessmentDegradation,
  analyzeQuestionSelection,
  analyzeRecovery,
  analyzeTimeAllocation,
  analyzeTopicSwitching,
  classifySpeedAccuracy,
  overallAccuracy,
} from "../withinSimulationAnalysis.js";
import { makeAttempt, makeAttemptRun } from "./fixtures.js";

describe("classifySpeedAccuracy", () => {
  it("returns zero sample size for an empty simulation", () => {
    const result = classifySpeedAccuracy([]);
    expect(result.sampleSize).toBe(0);
    expect(result.buckets.HIGH_ACCURACY_HIGH_SPEED).toBe(0);
  });

  it("buckets a fast correct answer as HIGH_ACCURACY_HIGH_SPEED", () => {
    const result = classifySpeedAccuracy([makeAttempt({ isCorrect: true, timeSpentSeconds: 30, expectedTimeSeconds: 60 })]);
    expect(result.buckets.HIGH_ACCURACY_HIGH_SPEED).toBe(100);
  });

  it("buckets a slow wrong answer as LOW_ACCURACY_LOW_SPEED", () => {
    const result = classifySpeedAccuracy([makeAttempt({ isCorrect: false, timeSpentSeconds: 120, expectedTimeSeconds: 60 })]);
    expect(result.buckets.LOW_ACCURACY_LOW_SPEED).toBe(100);
  });

  it("ignores unanswered questions (no isCorrect signal)", () => {
    const result = classifySpeedAccuracy([makeAttempt({ finalStatus: "unanswered", isCorrect: null })]);
    expect(result.sampleSize).toBe(0);
  });
});

describe("analyzeTimeAllocation", () => {
  it("flags a time sink only when a later question was left unanswered", () => {
    const attempts = [
      makeAttempt({ sequencePosition: 1, difficulty: "hard", timeSpentSeconds: 200, expectedTimeSeconds: 100, isCorrect: false, finalStatus: "answered" }),
      makeAttempt({ sequencePosition: 2, finalStatus: "unanswered", isCorrect: null }),
    ];
    const result = analyzeTimeAllocation(attempts);
    expect(result.sinkObservations).toHaveLength(1);
    expect(result.sinkObservations[0]).toContain("hard");
  });

  it("does not flag a heavy-time question if nothing later was left unanswered", () => {
    const attempts = [
      makeAttempt({ sequencePosition: 1, timeSpentSeconds: 200, expectedTimeSeconds: 100, isCorrect: false }),
      makeAttempt({ sequencePosition: 2, finalStatus: "answered", isCorrect: true }),
    ];
    expect(analyzeTimeAllocation(attempts).sinkObservations).toHaveLength(0);
  });

  it("does not flag a heavy-time question that was answered correctly", () => {
    const attempts = [
      makeAttempt({ sequencePosition: 1, timeSpentSeconds: 200, expectedTimeSeconds: 100, isCorrect: true }),
      makeAttempt({ sequencePosition: 2, finalStatus: "unanswered", isCorrect: null }),
    ];
    expect(analyzeTimeAllocation(attempts).sinkObservations).toHaveLength(0);
  });

  it("handles an empty simulation without dividing by zero", () => {
    const result = analyzeTimeAllocation([]);
    expect(result.avgTimePerQuestionSeconds).toBe(0);
    expect(result.unansweredCount).toBe(0);
  });
});

describe("analyzeQuestionSelection", () => {
  it("classifies a fast correct answer as EFFECTIVE", () => {
    const result = analyzeQuestionSelection([
      makeAttempt({ finalStatus: "answered", isCorrect: true, timeSpentSeconds: 40, expectedTimeSeconds: 60 }),
    ]);
    expect(result.breakdown.EFFECTIVE).toBe(1);
    expect(result.score).toBe(100);
  });

  it("classifies a slow wrong answer as INEFFICIENT", () => {
    const result = analyzeQuestionSelection([
      makeAttempt({ finalStatus: "answered", isCorrect: false, timeSpentSeconds: 150, expectedTimeSeconds: 60 }),
    ]);
    expect(result.breakdown.INEFFICIENT).toBe(1);
  });

  it("does not classify an unanswered hard question as a missed opportunity", () => {
    // Section 11: "Do not judge a decision as wrong merely because the
    // question was difficult" — a fast skip on a HARD question should not
    // be flagged the way a fast skip on an easy/medium one would be.
    const result = analyzeQuestionSelection([
      makeAttempt({ finalStatus: "unanswered", isCorrect: null, difficulty: "hard", timeSpentSeconds: 5, expectedTimeSeconds: 60, sequencePosition: 1 }),
      makeAttempt({ finalStatus: "answered", isCorrect: true, timeSpentSeconds: 50, expectedTimeSeconds: 60, sequencePosition: 2 }),
    ]);
    expect(result.breakdown.MISSED_OPPORTUNITY).toBe(0);
  });

  it("flags a fast, un-revisited skip on an easy question (with time otherwise available) as a missed opportunity", () => {
    const result = analyzeQuestionSelection([
      makeAttempt({ finalStatus: "unanswered", isCorrect: null, difficulty: "easy", revisitCount: 0, timeSpentSeconds: 5, expectedTimeSeconds: 60, sequencePosition: 1 }),
      makeAttempt({ finalStatus: "answered", isCorrect: true, timeSpentSeconds: 50, expectedTimeSeconds: 60, sequencePosition: 2 }),
    ]);
    expect(result.breakdown.MISSED_OPPORTUNITY).toBe(1);
  });

  it("returns zero sample size for an empty simulation", () => {
    expect(analyzeQuestionSelection([]).sampleSize).toBe(0);
  });
});

describe("analyzeTopicSwitching", () => {
  it("reports no switches when every question is the same topic", () => {
    const attempts = makeAttemptRun(5, [true], (i) => ({ topicId: "same-topic" }));
    const result = analyzeTopicSwitching(attempts);
    expect(result.switchCount).toBe(0);
    expect(result.hasGap).toBe(false);
  });

  it("detects a switching gap when accuracy drops sharply right after topic transitions", () => {
    const attempts = [
      makeAttempt({ sequencePosition: 1, topicId: "A", isCorrect: true }),
      makeAttempt({ sequencePosition: 2, topicId: "A", isCorrect: true }),
      makeAttempt({ sequencePosition: 3, topicId: "A", isCorrect: true }),
      // switches to B, C, D — each first question after a switch is wrong
      makeAttempt({ sequencePosition: 4, topicId: "B", isCorrect: false }),
      makeAttempt({ sequencePosition: 5, topicId: "C", isCorrect: false }),
      makeAttempt({ sequencePosition: 6, topicId: "D", isCorrect: false }),
    ];
    const result = analyzeTopicSwitching(attempts);
    expect(result.switchCount).toBe(3);
    expect(result.postSwitchAccuracy).toBe(0);
    expect(result.steadyStateAccuracy).toBe(100);
    expect(result.hasGap).toBe(true);
  });
});

describe("analyzeRecovery", () => {
  it("reports full recovery after every error", () => {
    const attempts = [
      makeAttempt({ sequencePosition: 1, isCorrect: false }),
      makeAttempt({ sequencePosition: 2, isCorrect: true }),
      makeAttempt({ sequencePosition: 3, isCorrect: true }),
    ];
    const result = analyzeRecovery(attempts, 2);
    expect(result.errorEventCount).toBe(1);
    expect(result.postErrorRecoveryRate).toBe(100);
  });

  it("detects a miss streak following an error", () => {
    const attempts = [
      makeAttempt({ sequencePosition: 1, isCorrect: false }),
      makeAttempt({ sequencePosition: 2, isCorrect: false }),
      makeAttempt({ sequencePosition: 3, isCorrect: false }),
    ];
    const result = analyzeRecovery(attempts, 2);
    expect(result.postErrorRecoveryRate).toBe(0);
    expect(result.longestPostErrorMissStreak).toBe(2);
  });

  it("returns null recovery rate when there are no errors to recover from", () => {
    const attempts = makeAttemptRun(3, [true]);
    const result = analyzeRecovery(attempts);
    expect(result.errorEventCount).toBe(0);
    expect(result.postErrorRecoveryRate).toBeNull();
  });
});

describe("analyzeEndOfAssessmentDegradation", () => {
  it("returns no verdict for very short simulations (fewer than 4 questions)", () => {
    const attempts = makeAttemptRun(3, [true]);
    const result = analyzeEndOfAssessmentDegradation(attempts);
    expect(result.hasDegradation).toBe(false);
    expect(result.firstQuarterAccuracy).toBeNull();
  });

  it("detects a sharp final-section decline", () => {
    // 20 questions: first 5 all correct, last 5 all wrong.
    const attempts = makeAttemptRun(20, [], (i) => ({ isCorrect: i < 5 ? true : i >= 15 ? false : true }));
    const result = analyzeEndOfAssessmentDegradation(attempts);
    expect(result.hasDegradation).toBe(true);
    expect(result.finalQuarterAccuracy).toBeLessThan(result.firstQuarterAccuracy!);
    expect(result.supportingSignals.length).toBeGreaterThan(0);
  });

  it("does not flag degradation when performance is flat throughout", () => {
    const attempts = makeAttemptRun(20, [true]);
    const result = analyzeEndOfAssessmentDegradation(attempts);
    expect(result.hasDegradation).toBe(false);
  });
});

describe("overallAccuracy", () => {
  it("excludes unanswered questions from the denominator", () => {
    const attempts = [
      makeAttempt({ isCorrect: true, finalStatus: "answered" }),
      makeAttempt({ isCorrect: null, finalStatus: "unanswered" }),
    ];
    expect(overallAccuracy(attempts)).toBe(100);
  });

  it("returns null when nothing was answered", () => {
    expect(overallAccuracy([makeAttempt({ isCorrect: null, finalStatus: "unanswered" })])).toBeNull();
  });
});
