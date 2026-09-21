import { describe, expect, it } from "vitest";
import { computeGaps, identifyPrimaryGaps } from "../src/engines/targetGapEngine.js";
import type { CapabilityDimensionKey, CapabilitySnapshot, ReadinessTarget } from "../src/domain/types.js";

function snapshot(values: Partial<Record<CapabilityDimensionKey, number>>): CapabilitySnapshot {
  const dimensions: CapabilitySnapshot["dimensions"] = {};
  (Object.keys(values) as CapabilityDimensionKey[]).forEach((key) => {
    dimensions[key] = {
      key,
      value: values[key]!,
      label: "MODERATE",
      observationCount: 10,
      lastUpdated: new Date().toISOString(),
    };
  });
  return { studentId: "s1", dimensions, asOf: new Date().toISOString() };
}

const target: ReadinessTarget = {
  studentId: "s1",
  targetDimensions: { mastery: 85, retention: 80, transfer: 75, speed: 78 },
  overallTarget: 82,
};

describe("computeGaps", () => {
  it("computes target minus current using the spec's own worked numbers (section 11 & 31)", () => {
    const gaps = computeGaps(snapshot({ mastery: 85, retention: 82, transfer: 61, speed: 67 }), target);
    expect(gaps.find((g) => g.dimension === "transfer")?.gap).toBe(14);
  });

  it("allows a negative gap when the student already exceeds target", () => {
    const gaps = computeGaps(snapshot({ retention: 82 }), target);
    expect(gaps.find((g) => g.dimension === "retention")?.gap).toBe(-2);
  });

  it("skips dimensions with no configured target rather than guessing one", () => {
    const gaps = computeGaps(snapshot({ mastery: 85, accuracy: 83 }), target);
    expect(gaps.find((g) => g.dimension === "accuracy")).toBeUndefined();
  });
});

describe("identifyPrimaryGaps", () => {
  it("ranks only dimensions actually behind target, largest gap first", () => {
    const gaps = computeGaps(snapshot({ mastery: 85, retention: 82, transfer: 61, speed: 67 }), target);
    const primary = identifyPrimaryGaps(gaps);
    expect(primary[0]?.dimension).toBe("transfer");
    expect(primary.every((g) => g.gap > 0)).toBe(true);
  });

  it("respects the topN limit", () => {
    const gaps = computeGaps(snapshot({ mastery: 40, retention: 40, transfer: 40, speed: 40 }), target);
    expect(identifyPrimaryGaps(gaps, 2)).toHaveLength(2);
  });
});
