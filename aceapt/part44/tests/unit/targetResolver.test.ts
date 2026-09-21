import { describe, expect, it } from "vitest";
import { resolveTarget } from "../../src/engines/targetResolver.js";
import type { CapabilitySnapshot } from "../../src/domain/types.js";

const current: CapabilitySnapshot = {
  studentId: "s1",
  assessedAt: new Date().toISOString(),
  scores: { quant: 78, logical: 51, verbal: 72 },
  accuracy: 71,
  speedBand: "DEVELOPING",
};

describe("targetResolver.resolveTarget", () => {
  it("applies the goal-type benchmark for PLACEMENT_READINESS when the student gave no explicit target", () => {
    const result = resolveTarget({ goalType: "PLACEMENT_READINESS", current, explicit: {} });
    expect(result.capability.logical).toBe(75);
    expect(result.sources.logical).toBe("GOAL_TYPE_BENCHMARK");
    expect(result.explicitlyTargetedDimensions.has("logical")).toBe(false);
  });

  it("lets an explicit student target always win over the benchmark", () => {
    const result = resolveTarget({
      goalType: "PLACEMENT_READINESS",
      current,
      explicit: { capability: { logical: 90 } },
    });
    expect(result.capability.logical).toBe(90);
    expect(result.sources.logical).toBe("STUDENT");
    expect(result.explicitlyTargetedDimensions.has("logical")).toBe(true);
  });

  it("prefers a validated assessment benchmark over the generic goal-type one", () => {
    const result = resolveTarget({
      goalType: "ASSESSMENT_PREPARATION",
      current,
      explicit: {},
      assessmentBenchmark: { capability: { logical: 82 } },
    });
    expect(result.capability.logical).toBe(82);
    expect(result.sources.logical).toBe("ASSESSMENT_BENCHMARK");
  });

  it("never invents a target for SKILL_IMPROVEMENT beyond what was named (Section 19)", () => {
    const result = resolveTarget({ goalType: "SKILL_IMPROVEMENT", current, explicit: {} });
    expect(Object.keys(result.capability)).toHaveLength(0);
    expect(result.accuracy).toBeNull();
    expect(result.speedBand).toBeNull();
  });

  it("resolves a SKILL_IMPROVEMENT focus dimension to current-plus-delta, not a fixed benchmark", () => {
    const result = resolveTarget({
      goalType: "SKILL_IMPROVEMENT",
      current,
      explicit: {},
      focusDimension: "logical",
    });
    expect(result.capability.logical).toBe(66); // 51 + 15
    expect(result.sources.logical).toBe("CURRENT_PLUS_DELTA");
    expect(result.explicitlyTargetedDimensions.has("logical")).toBe(true);
  });

  it("never sets a capability target for CUSTOM goals without explicit input", () => {
    const result = resolveTarget({ goalType: "CUSTOM", current, explicit: {} });
    expect(Object.keys(result.capability)).toHaveLength(0);
  });

  it("moves speed target to the next band up for SPEED_IMPROVEMENT goals", () => {
    const result = resolveTarget({ goalType: "SPEED_IMPROVEMENT", current, explicit: {} });
    expect(result.speedBand).toBe("ON_PACE"); // next up from DEVELOPING
  });
});
