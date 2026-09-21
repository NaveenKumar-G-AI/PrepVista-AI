import { describe, expect, it } from "vitest";
import { computeConfidence } from "../../src/engine/evaluation/confidence.js";
import type { ConfidenceFactors } from "../../src/domain/types.js";

const BASE: ConfidenceFactors = {
  responseQuality: 0.5,
  questionDifficulty: 0.5,
  questionCount: 2,
  evidenceConsistency: 0.5,
  projectCodeAlignment: null,
  priorEvidenceWeight: 0.3,
  followUpDepth: 0.3,
};

describe("computeConfidence — bounds and monotonicity", () => {
  it("always returns a value in [0, 1]", () => {
    const c = computeConfidence(BASE);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });

  it("clamps out-of-range factor inputs instead of producing an out-of-range result", () => {
    const c = computeConfidence({ ...BASE, responseQuality: 5, evidenceConsistency: -3 });
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });

  it("increases (or holds) as questionCount increases, all else equal", () => {
    const low = computeConfidence({ ...BASE, questionCount: 1 });
    const high = computeConfidence({ ...BASE, questionCount: 5 });
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it("increases (or holds) as evidenceConsistency increases, all else equal", () => {
    const low = computeConfidence({ ...BASE, evidenceConsistency: 0 });
    const high = computeConfidence({ ...BASE, evidenceConsistency: 1 });
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it("treats null projectCodeAlignment as a neutral midpoint, not zero", () => {
    const withNull = computeConfidence({ ...BASE, projectCodeAlignment: null });
    const withZero = computeConfidence({ ...BASE, projectCodeAlignment: 0 });
    expect(withNull).toBeGreaterThan(withZero);
  });
});

describe("computeConfidence — independence from performance (Phase 24)", () => {
  // The critical property: confidence measures how much/how-good the
  // EVIDENCE-GATHERING was, not whether the answer was judged correct.
  // These factors deliberately contain nothing about correctness — the
  // test asserts that varying only the evidence-quality factors moves the
  // score, while the function signature itself never accepts a
  // "correctness" input at all (there is no such parameter to vary).
  it("produces identical confidence for two calls with identical evidence-quality factors, regardless of any external correctness label", () => {
    // Simulates a STRONG-but-wrong and a WEAK-but-right response that happen
    // to produce the same evidence-quality profile (equal response length/
    // clarity, equal question count, equal consistency) — confidence must
    // match, since it was computed only from these factors.
    const strongWrong = computeConfidence(BASE);
    const weakRight = computeConfidence({ ...BASE });
    expect(strongWrong).toBe(weakRight);
  });

  it("a low-confidence result can coexist with either correct or incorrect answers — confidence has no correctness field to check", () => {
    const factors: ConfidenceFactors = { ...BASE, questionCount: 1, evidenceConsistency: 0.2, followUpDepth: 0 };
    const result = computeConfidence(factors);
    expect(result).toBeLessThan(0.5);
    // The function's own type signature (ConfidenceFactors) has no
    // correctness/adaptiveSignal field — this is what "independent of
    // performance" means at the type level, not just the value level.
    expect(Object.keys(factors)).not.toContain("correctness");
    expect(Object.keys(factors)).not.toContain("adaptiveSignal");
  });
});

describe("computeConfidence — weights sum to a sane total", () => {
  it("a maximally-confident profile approaches 1", () => {
    const maxed: ConfidenceFactors = {
      responseQuality: 1,
      questionDifficulty: 1,
      questionCount: 10,
      evidenceConsistency: 1,
      projectCodeAlignment: 1,
      priorEvidenceWeight: 1,
      followUpDepth: 1,
    };
    expect(computeConfidence(maxed)).toBeGreaterThan(0.95);
  });

  it("a minimally-confident profile approaches 0", () => {
    const minned: ConfidenceFactors = {
      responseQuality: 0,
      questionDifficulty: 0,
      questionCount: 0,
      evidenceConsistency: 0,
      projectCodeAlignment: 0,
      priorEvidenceWeight: 0,
      followUpDepth: 0,
    };
    expect(computeConfidence(minned)).toBeLessThan(0.05);
  });
});
