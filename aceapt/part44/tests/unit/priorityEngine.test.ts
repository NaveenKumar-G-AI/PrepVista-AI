import { describe, expect, it } from "vitest";
import { computeGap } from "../../src/engines/gapEngine.js";
import { computePriority } from "../../src/engines/priorityEngine.js";
import { resolveTarget } from "../../src/engines/targetResolver.js";
import type { CapabilitySnapshot } from "../../src/domain/types.js";

describe("priorityEngine.computePriority", () => {
  it("ranks Logical highest for the spec's own worked PLACEMENT_READINESS example (Section 22)", () => {
    const current: CapabilitySnapshot = {
      studentId: "s1",
      assessedAt: new Date().toISOString(),
      scores: { quant: 78, logical: 51, verbal: 72 },
      improvementRatePerHour: { quant: 1.1, logical: 2.4, verbal: 0.9 },
    };
    const target = resolveTarget({ goalType: "PLACEMENT_READINESS", current, explicit: {} });
    const gap = computeGap({
      current,
      targetCapability: target.capability,
      targetAccuracy: target.accuracy,
      targetSpeedBand: target.speedBand,
    });
    const result = computePriority({
      goalType: "PLACEMENT_READINESS",
      gap,
      current,
      explicitlyTargetedDimensions: target.explicitlyTargetedDimensions,
      targetSpeedBand: target.speedBand,
      targetAccuracy: target.accuracy,
      daysRemaining: null,
    });

    expect(result.top).toBe("logical");
    // quant already meets its benchmark (78 >= 75) - zero gap - should
    // never outrank a dimension with a real, unmet gap.
    const quant = result.ranked.find((r) => r.target === "quant")!;
    const logical = result.ranked.find((r) => r.target === "logical")!;
    expect(logical.score).toBeGreaterThan(quant.score);
  });

  it("shifts weight toward quick-win dimensions as the deadline tightens (Section 16)", () => {
    const current: CapabilitySnapshot = {
      studentId: "s1",
      assessedAt: new Date().toISOString(),
      scores: { logical: 50, verbal: 50 },
      improvementRatePerHour: { logical: 0.5, verbal: 3.0 }, // verbal is the quick win
    };
    const target = { capability: { logical: 80, verbal: 80 }, accuracy: null, speedBand: null };
    const gap = computeGap({
      current,
      targetCapability: target.capability,
      targetAccuracy: null,
      targetSpeedBand: null,
    });

    const relaxed = computePriority({
      goalType: "OVERALL_APTITUDE",
      gap,
      current,
      targetSpeedBand: null,
      targetAccuracy: null,
      daysRemaining: 90,
    });
    const urgent = computePriority({
      goalType: "OVERALL_APTITUDE",
      gap,
      current,
      targetSpeedBand: null,
      targetAccuracy: null,
      daysRemaining: 2,
    });

    // Equal gap size on both dimensions (30 pts each) means the relaxed
    // case is roughly a toss-up, but under real time pressure the
    // engine should favor verbal's much higher learning-opportunity.
    const verbalUrgent = urgent.ranked.find((r) => r.target === "verbal")!;
    const logicalUrgent = urgent.ranked.find((r) => r.target === "logical")!;
    expect(verbalUrgent.score).toBeGreaterThan(logicalUrgent.score);
    expect(urgent.timeUrgency).toBeGreaterThan(relaxed.timeUrgency);
  });

  it("excludes a speed/accuracy axis once its target is already met", () => {
    const current: CapabilitySnapshot = {
      studentId: "s1",
      assessedAt: new Date().toISOString(),
      scores: {},
      accuracy: 90,
      speedBand: "FAST",
    };
    const gap = computeGap({
      current,
      targetCapability: {},
      targetAccuracy: 80,
      targetSpeedBand: "ON_PACE",
    });
    const result = computePriority({
      goalType: "PLACEMENT_READINESS",
      gap,
      current,
      targetSpeedBand: "ON_PACE",
      targetAccuracy: 80,
      daysRemaining: 30,
    });
    expect(result.ranked.find((r) => r.target === "speed")).toBeUndefined();
    expect(result.ranked.find((r) => r.target === "accuracy")).toBeUndefined();
  });
});
