import { describe, it, expect } from "vitest";
import { applyEvidence, compositeLevel } from "../src/engine/capabilityModel.js";

describe("capabilityModel", () => {
  it("starts a fresh capability at the observed value, not blended toward 0", () => {
    const state = applyEvidence(null, "s1", "cap.a", "PERFORMANCE", { correct: 8, total: 10, passed: true });
    expect(state.accuracy).toBeCloseTo(80, 5);
    expect(state.evidenceCount).toBe(1);
  });

  it("moves gradually (EMA), not all the way to the new observation", () => {
    const first = applyEvidence(null, "s1", "cap.a", "PERFORMANCE", { correct: 5, total: 10, passed: true }); // 50
    const second = applyEvidence(first, "s1", "cap.a", "PERFORMANCE", { correct: 10, total: 10, passed: true }); // 100
    expect(second.accuracy).toBeGreaterThan(50);
    expect(second.accuracy).toBeLessThan(100);
  });

  it("regression test: a PRACTICE-type action with timing data moves the speed dimension", () => {
    // This is the exact bug found by running the server live: the next-best-
    // action engine can recommend a PRACTICE action for a speed-dimension
    // bottleneck, and completing it must be able to actually close that gap.
    const prior = applyEvidence(null, "s1", "cap.speed", "LEARNING", { correct: 8, total: 10 });
    const afterPractice = applyEvidence(prior, "s1", "cap.speed", "PRACTICE", {
      correct: 9,
      total: 10,
      timeTakenSeconds: 600,
      timeAllowedSeconds: 1200,
      passed: true,
    });
    expect(afterPractice.speed).toBeGreaterThan(prior.speed);
  });

  it("does not move speed when no timing data is present, regardless of type", () => {
    const prior = applyEvidence(null, "s1", "cap.b", "PERFORMANCE", { correct: 8, total: 10, passed: true });
    const after = applyEvidence(prior, "s1", "cap.b", "PERFORMANCE", { correct: 9, total: 10, passed: true });
    expect(after.speed).toBe(prior.speed);
  });

  it("moves transfer only on a NOVEL-context attempt", () => {
    const prior = applyEvidence(null, "s1", "cap.c", "PRACTICE", { correct: 8, total: 10 });
    const seen = applyEvidence(prior, "s1", "cap.c", "TRANSFER", { correct: 9, total: 10, contextNovelty: "SEEN" });
    expect(seen.transfer).toBe(prior.transfer);
    const novel = applyEvidence(prior, "s1", "cap.c", "TRANSFER", { correct: 9, total: 10, contextNovelty: "NOVEL" });
    expect(novel.transfer).toBeGreaterThan(prior.transfer);
  });

  it("weighs LEARNING evidence more lightly than graded evidence on accuracy", () => {
    const base = applyEvidence(null, "s1", "cap.d", "PERFORMANCE", { correct: 5, total: 10, passed: true }); // seeds at 50
    const afterLearning = applyEvidence(base, "s1", "cap.d", "LEARNING", { correct: 10, total: 10 });
    const afterPerformance = applyEvidence(base, "s1", "cap.d", "PERFORMANCE", { correct: 10, total: 10, passed: true });
    expect(afterLearning.accuracy).toBeLessThan(afterPerformance.accuracy);
  });

  it("compositeLevel is a fixed weighted blend of the four dimensions", () => {
    const level = compositeLevel({ accuracy: 100, speed: 0, transfer: 0, consistency: 0 });
    expect(level).toBeCloseTo(30, 5); // accuracy weight is 0.3
  });
});
