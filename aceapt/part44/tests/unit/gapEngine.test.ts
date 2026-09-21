import { describe, expect, it } from "vitest";
import { computeGap } from "../../src/engines/gapEngine.js";
import type { CapabilitySnapshot } from "../../src/domain/types.js";

const baseSnapshot: CapabilitySnapshot = {
  studentId: "s1",
  assessedAt: new Date().toISOString(),
  scores: { quant: 72, logical: 54, verbal: 68 },
  accuracy: 71,
  speedBand: "DEVELOPING",
  consistency: 58,
};

describe("gapEngine.computeGap", () => {
  it("matches the worked example from the Feature 44 spec (Section 71)", () => {
    const result = computeGap({
      current: baseSnapshot,
      targetCapability: { quant: 80, logical: 80, verbal: 80 },
      targetAccuracy: null,
      targetSpeedBand: null,
    });
    const logical = result.capability.find((c) => c.dimension === "logical")!;
    expect(logical.gap).toBe(26);
    expect(logical.classification).toBe("LARGE");
    const quant = result.capability.find((c) => c.dimension === "quant")!;
    expect(quant.gap).toBe(8);
    expect(quant.classification).toBe("SMALL");
  });

  it("treats an already-met target as zero gap, not negative (Section 34)", () => {
    const result = computeGap({
      current: baseSnapshot,
      targetCapability: { quant: 60 }, // below current 72
      targetAccuracy: null,
      targetSpeedBand: null,
    });
    const quant = result.capability.find((c) => c.dimension === "quant")!;
    expect(quant.gap).toBe(0);
    expect(quant.classification).toBe("NONE");
  });

  it("never invents a current score for a dimension with no data (Section 69)", () => {
    const result = computeGap({
      current: { ...baseSnapshot, scores: { quant: 72 } },
      targetCapability: { quant: 80, probability: 75 }, // no current probability data
      targetAccuracy: null,
      targetSpeedBand: null,
    });
    const probability = result.capability.find((c) => c.dimension === "probability")!;
    expect(probability.current).toBeNull();
    expect(probability.gap).toBeNull();
    expect(probability.classification).toBe("UNKNOWN");
  });

  it("marks a dimension with no target as TARGET_PENDING-equivalent (unknown gap), not silently dropped", () => {
    const result = computeGap({
      current: baseSnapshot,
      targetCapability: { quant: 80 }, // logical/verbal have current data but no target
      targetAccuracy: null,
      targetSpeedBand: null,
    });
    const logical = result.capability.find((c) => c.dimension === "logical")!;
    expect(logical.target).toBeNull();
    expect(logical.gap).toBeNull();
    expect(logical.classification).toBe("UNKNOWN");
  });

  it("computes accuracy gap only when a target accuracy is set", () => {
    const withTarget = computeGap({
      current: baseSnapshot,
      targetCapability: {},
      targetAccuracy: 85,
      targetSpeedBand: null,
    });
    expect(withTarget.accuracyGap).toEqual({ current: 71, target: 85, gap: 14 });

    const withoutTarget = computeGap({
      current: baseSnapshot,
      targetCapability: {},
      targetAccuracy: null,
      targetSpeedBand: null,
    });
    expect(withoutTarget.accuracyGap).toBeNull();
  });

  it("evaluates speed gap by band rank, not raw numbers", () => {
    const met = computeGap({
      current: { ...baseSnapshot, speedBand: "FAST" },
      targetCapability: {},
      targetAccuracy: null,
      targetSpeedBand: "ON_PACE",
    });
    expect(met.speedGap?.met).toBe(true);

    const notMet = computeGap({
      current: { ...baseSnapshot, speedBand: "SLOW" },
      targetCapability: {},
      targetAccuracy: null,
      targetSpeedBand: "ON_PACE",
    });
    expect(notMet.speedGap?.met).toBe(false);
  });

  it("lists retention/transfer/difficulty gap as unsupported rather than fabricating them", () => {
    const result = computeGap({
      current: baseSnapshot,
      targetCapability: { quant: 80 },
      targetAccuracy: null,
      targetSpeedBand: null,
    });
    expect(result.unsupported.some((u) => u.startsWith("retention_gap"))).toBe(true);
    expect(result.unsupported.some((u) => u.startsWith("transfer_gap"))).toBe(true);
    expect(result.unsupported.some((u) => u.startsWith("difficulty_gap"))).toBe(true);
  });

  it("computes consistency gap once a benchmark is explicitly configured", () => {
    const result = computeGap({
      current: baseSnapshot,
      targetCapability: {},
      targetAccuracy: null,
      targetSpeedBand: null,
      targetConsistency: 75,
    });
    expect(result.consistencyGap).toEqual({ current: 58, target: 75, gap: 17 });
    expect(result.unsupported.some((u) => u.startsWith("consistency_gap"))).toBe(false);
  });
});
