import { describe, it, expect } from "vitest";
import { DIMENSION_WEIGHTS } from "../src/config/scoring.config";
import { aggregateScore, classifyState, scoreFromAlignment } from "../src/engine/scoring";
import type { ConsistencyDimension, DimensionResult } from "../src/types";

describe("scoring config", () => {
  it("dimension weights sum to 1", () => {
    const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe("scoreFromAlignment", () => {
  it("returns null for UNKNOWN", () => {
    expect(scoreFromAlignment("UNKNOWN", 0.9)).toBeNull();
  });
  it("pulls low-confidence scores toward neutral (50)", () => {
    const highConfidence = scoreFromAlignment("MISMATCH", 0.9)!;
    const lowConfidence = scoreFromAlignment("MISMATCH", 0.1)!;
    expect(lowConfidence).toBeGreaterThan(highConfidence);
  });
  it("MATCH scores higher than PARTIAL scores higher than MISMATCH at equal confidence", () => {
    const match = scoreFromAlignment("MATCH", 0.8)!;
    const partial = scoreFromAlignment("PARTIAL", 0.8)!;
    const mismatch = scoreFromAlignment("MISMATCH", 0.8)!;
    expect(match).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(mismatch);
  });
});

describe("classifyState", () => {
  it("classifies thresholds correctly", () => {
    expect(classifyState(95)).toBe("HIGHLY_CONSISTENT");
    expect(classifyState(80)).toBe("MOSTLY_CONSISTENT");
    expect(classifyState(60)).toBe("PARTIALLY_CONSISTENT");
    expect(classifyState(20)).toBe("SIGNIFICANTLY_INCONSISTENT");
  });
});

describe("aggregateScore", () => {
  const dims = Object.keys(DIMENSION_WEIGHTS) as ConsistencyDimension[];
  const makeResult = (dimension: ConsistencyDimension, score: number | null): DimensionResult => ({
    dimension,
    alignment: score === null ? "UNKNOWN" : "MATCH",
    score,
    confidence: 0.8,
    evidenceStrength: "STRONG",
    findings: [],
  });

  it("returns INSUFFICIENT_EVIDENCE when too few dimensions have scores", () => {
    const results = dims.map((d, i) => makeResult(d, i === 0 ? 90 : null));
    const { overallState, overallScore } = aggregateScore(results);
    expect(overallState).toBe("INSUFFICIENT_EVIDENCE");
    expect(overallScore).toBeNull();
  });

  it("weights scored dimensions correctly when coverage is sufficient", () => {
    const results = dims.map((d) => makeResult(d, 90));
    const { overallScore, overallState } = aggregateScore(results);
    expect(overallScore).toBeCloseTo(90, 0);
    expect(overallState).toBe("HIGHLY_CONSISTENT");
  });

  it("renormalizes weights over only the dimensions that have evidence", () => {
    // Half the dimensions score 100, half are UNKNOWN (still >= 50% coverage) - overall should be ~100, not diluted by the UNKNOWNs.
    const results = dims.map((d, i) => makeResult(d, i % 2 === 0 ? 100 : null));
    const { overallScore } = aggregateScore(results);
    expect(overallScore).toBeCloseTo(100, 0);
  });
});
