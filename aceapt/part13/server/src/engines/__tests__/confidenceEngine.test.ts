import { describe, expect, it } from "vitest";
import { computeConfidence } from "../confidenceEngine.js";

const fullEvidence = {
  sampleSize: 6,
  recencyDays: 2,
  consistency: 0.9,
  assessmentSimilarity: 1,
  novelty: 0.9,
  topicCoverage: 1,
  difficultyCoverage: 1,
};

describe("computeConfidence", () => {
  it("returns HIGH confidence for rich, recent, consistent evidence", () => {
    const result = computeConfidence(fullEvidence);
    expect(result.level).toBe("HIGH");
    expect(result.limitingFactors).toHaveLength(0);
  });

  it("returns LOW confidence with zero evidence", () => {
    const result = computeConfidence({
      sampleSize: 0,
      recencyDays: null,
      consistency: null,
      assessmentSimilarity: 0.3,
      novelty: 0,
      topicCoverage: 0,
      difficultyCoverage: 0,
    });
    expect(result.level).toBe("LOW");
    expect(result.limitingFactors.length).toBeGreaterThan(0);
  });

  it("never produces a score outside [0, 1]", () => {
    const result = computeConfidence({ ...fullEvidence, sampleSize: 999, novelty: 5, topicCoverage: -3 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("penalizes stale evidence even with a large sample size", () => {
    const stale = computeConfidence({ ...fullEvidence, recencyDays: 90 });
    const fresh = computeConfidence({ ...fullEvidence, recencyDays: 2 });
    expect(stale.score).toBeLessThan(fresh.score);
  });

  it("treats a null consistency (not enough data to measure) as a penalty, not neutral", () => {
    const withData = computeConfidence({ ...fullEvidence, consistency: 0.9 });
    const withoutData = computeConfidence({ ...fullEvidence, consistency: null });
    expect(withoutData.score).toBeLessThan(withData.score);
  });

  it("is monotonic in sample size, all else equal", () => {
    const low = computeConfidence({ ...fullEvidence, sampleSize: 1 });
    const high = computeConfidence({ ...fullEvidence, sampleSize: 6 });
    expect(high.score).toBeGreaterThan(low.score);
  });
});
