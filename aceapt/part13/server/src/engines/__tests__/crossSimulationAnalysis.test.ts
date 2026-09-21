import { describe, expect, it } from "vitest";
import { analyzeConditionGap, analyzeConsistency, analyzeNovelPerformance, detectSkillDecay } from "../crossSimulationAnalysis.js";
import { makeAttempt, makeSimulation } from "./fixtures.js";

describe("analyzeConditionGap", () => {
  it("reports no gap with zero simulations", () => {
    const result = analyzeConditionGap([]);
    expect(result.hasConditionGap).toBe(false);
    expect(result.gapSizePoints).toBeNull();
  });

  it("detects a large gap between topic practice and realistic simulation accuracy", () => {
    const practiceAttempts = Array.from({ length: 10 }, (_, i) => makeAttempt({ isCorrect: i < 9 })); // 90%
    const realisticAttempts = Array.from({ length: 10 }, (_, i) => makeAttempt({ isCorrect: i < 6 })); // 60%
    const sims = [
      makeSimulation({ practiceMode: "topic_practice", status: "submitted", attempts: practiceAttempts }),
      makeSimulation({ practiceMode: "realistic_simulation", status: "submitted", attempts: realisticAttempts }),
    ];
    const result = analyzeConditionGap(sims);
    expect(result.hasConditionGap).toBe(true);
    expect(result.gapSizePoints).toBeCloseTo(30, 0);
  });

  it("ignores simulations that were never submitted", () => {
    const sims = [makeSimulation({ practiceMode: "realistic_simulation", status: "in_progress", attempts: [makeAttempt()] })];
    const result = analyzeConditionGap(sims);
    const realisticEntry = result.byMode.find((m) => m.mode === "realistic_simulation");
    expect(realisticEntry?.sampleSize).toBe(0);
  });
});

describe("analyzeConsistency", () => {
  it("returns zero sample size with no realistic simulations", () => {
    expect(analyzeConsistency([]).sampleSize).toBe(0);
  });

  it("computes average, range, and a positive trend for improving scores", () => {
    const sims = [0.6, 0.65, 0.7, 0.78].map((acc, i) =>
      makeSimulation({ practiceMode: "realistic_simulation", status: "submitted", accuracy: acc, submittedAt: `2026-01-0${i + 1}T00:00:00.000Z` })
    );
    const result = analyzeConsistency(sims);
    expect(result.sampleSize).toBe(4);
    expect(result.worst).toBeCloseTo(60, 0);
    expect(result.best).toBeCloseTo(78, 0);
    expect(result.trendSlope).toBeGreaterThan(0);
  });

  it("does not count practice-mode simulations toward consistency", () => {
    const sims = [makeSimulation({ practiceMode: "topic_practice", status: "submitted", accuracy: 0.9 })];
    expect(analyzeConsistency(sims).sampleSize).toBe(0);
  });
});

describe("detectSkillDecay", () => {
  it("flags a topic whose accuracy dropped well below its peak after a long gap", () => {
    const topicId = "quant";
    const sims = [
      makeSimulation({
        status: "submitted",
        submittedAt: "2026-01-01T00:00:00.000Z",
        attempts: Array.from({ length: 10 }, () => makeAttempt({ topicId, isCorrect: true })), // 100%
      }),
      makeSimulation({
        status: "submitted",
        submittedAt: "2026-01-15T00:00:00.000Z",
        attempts: Array.from({ length: 10 }, (_, i) => makeAttempt({ topicId, isCorrect: i < 5 })), // 50%
      }),
    ];
    // "now" is 45 days after the topic was last actually tested — this is
    // what makes it decay-from-inactivity rather than just a bad day.
    const now = new Date("2026-03-01T00:00:00.000Z");
    const signals = detectSkillDecay(sims, now);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.topicId).toBe(topicId);
    expect(signals[0]!.daysSinceLastTested).toBeGreaterThanOrEqual(10);
  });

  it("does not flag a topic tested only once", () => {
    const sims = [makeSimulation({ status: "submitted", attempts: [makeAttempt({ topicId: "quant", isCorrect: false })] })];
    expect(detectSkillDecay(sims)).toHaveLength(0);
  });

  it("does not flag a small recent dip with no time gap", () => {
    const topicId = "quant";
    const sims = [
      makeSimulation({ status: "submitted", submittedAt: "2026-01-01T00:00:00.000Z", attempts: [makeAttempt({ topicId, isCorrect: true })] }),
      makeSimulation({ status: "submitted", submittedAt: "2026-01-02T00:00:00.000Z", attempts: [makeAttempt({ topicId, isCorrect: false })] }),
    ];
    expect(detectSkillDecay(sims, new Date("2026-01-02T00:00:00.000Z"))).toHaveLength(0);
  });
});

describe("analyzeNovelPerformance", () => {
  it("treats every question in the first-ever simulation as novel", () => {
    const sims = [makeSimulation({ status: "submitted", submittedAt: "2026-01-01T00:00:00.000Z", attempts: [makeAttempt({ questionId: "q1", isCorrect: true })] })];
    const result = analyzeNovelPerformance(sims);
    expect(result.novelFractionMostRecent).toBe(1);
    expect(result.seenBeforeAccuracy).toBeNull();
  });

  it("classifies a repeated question as seen-before on the second exposure", () => {
    const sims = [
      makeSimulation({ status: "submitted", submittedAt: "2026-01-01T00:00:00.000Z", attempts: [makeAttempt({ questionId: "q1", isCorrect: true })] }),
      makeSimulation({ status: "submitted", submittedAt: "2026-01-02T00:00:00.000Z", attempts: [makeAttempt({ questionId: "q1", isCorrect: false })] }),
    ];
    const result = analyzeNovelPerformance(sims);
    expect(result.novelFractionMostRecent).toBe(0);
    expect(result.seenBeforeAccuracy).toBe(0);
  });
});
