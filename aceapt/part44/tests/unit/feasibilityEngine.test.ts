import { describe, expect, it } from "vitest";
import { computeFeasibility } from "../../src/engines/feasibilityEngine.js";
import type { PriorityScoreBreakdown } from "../../src/domain/types.js";

function target(t: string): PriorityScoreBreakdown {
  return { target: t as any, goalRelevance: 1, normalizedGap: 0.5, assessmentRelevance: 0.5, learningOpportunity: 0.5, score: 0.7, reason: "" };
}

describe("feasibilityEngine.computeFeasibility", () => {
  it("returns null feasibility (not a guess) when the goal has no deadline (Section 47)", () => {
    const result = computeFeasibility({
      ranked: [target("logical")],
      gapsByTarget: { logical: 20 },
      hoursPerPointByTarget: { logical: 0.5 },
      availableTime: { monday: 30 },
      daysRemaining: null,
    });
    expect(result.feasibility).toBeNull();
  });

  it("returns INSUFFICIENT_EVIDENCE when there is no improvement-rate history at all", () => {
    const result = computeFeasibility({
      ranked: [target("logical")],
      gapsByTarget: { logical: 20 },
      hoursPerPointByTarget: { logical: null },
      availableTime: { monday: 30 },
      daysRemaining: 20,
    });
    expect(result.feasibility).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("returns ON_TRACK when available time comfortably exceeds the estimate", () => {
    const result = computeFeasibility({
      ranked: [target("logical")],
      gapsByTarget: { logical: 5 }, // small gap
      hoursPerPointByTarget: { logical: 0.2 }, // 1 hour needed total
      availableTime: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60 },
      daysRemaining: 30,
    });
    expect(result.feasibility).toBe("ON_TRACK");
  });

  it("returns HIGHLY_CONSTRAINED for an ambitious target against near-zero availability (Section 45 conflict example)", () => {
    const result = computeFeasibility({
      ranked: [target("logical"), target("quant"), target("verbal")],
      gapsByTarget: { logical: 40, quant: 35, verbal: 30 },
      hoursPerPointByTarget: { logical: 0.5, quant: 0.5, verbal: 0.5 },
      availableTime: { monday: 15 }, // 15 min/day, 5 days total per week in the example
      daysRemaining: 5,
    });
    expect(result.feasibility).toBe("HIGHLY_CONSTRAINED");
  });

  it("treats zero availability as a valid (if extreme) input, not a crash", () => {
    const result = computeFeasibility({
      ranked: [target("logical")],
      gapsByTarget: { logical: 20 },
      hoursPerPointByTarget: { logical: 0.5 },
      availableTime: { monday: 0, tuesday: 0 },
      daysRemaining: 10,
    });
    expect(result.feasibility).toBe("HIGHLY_CONSTRAINED");
    expect(result.availableHours).toBe(0);
  });
});
