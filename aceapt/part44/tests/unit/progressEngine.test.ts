import { describe, expect, it } from "vitest";
import { computeProgress } from "../../src/engines/progressEngine.js";

describe("progressEngine.computeProgress", () => {
  it("computes the before/after example from Section 27 correctly", () => {
    const result = computeProgress({
      baseline: { logical: 54 },
      latest: { logical: 68 },
      target: { logical: 80 },
    });
    const d = result.perDimension[0]!;
    expect(d.change).toBe(14);
    expect(d.progressPct).toBeCloseTo((14 / 26) * 100, 1);
  });

  it("is never equal to a raw activity ratio - two students with identical capability gains score identically regardless of how many questions they did", () => {
    // progressEngine never receives an activity count at all - this test
    // documents that the input shape makes activity-based progress
    // structurally impossible, not just avoided by convention.
    const result = computeProgress({
      baseline: { logical: 50 },
      latest: { logical: 60 },
      target: { logical: 70 },
    });
    expect(result.perDimension[0]!.progressPct).toBe(50);
  });

  it("reports 100% immediately when the target was already met at goal creation (Section 34)", () => {
    const result = computeProgress({
      baseline: { quant: 82 },
      latest: { quant: 82 },
      target: { quant: 75 }, // target below baseline - already achieved
    });
    expect(result.perDimension[0]!.progressPct).toBe(100);
  });

  it("never guesses a dimension missing a baseline, latest, or target value", () => {
    const result = computeProgress({
      baseline: { logical: 54 },
      latest: {}, // no fresh data for logical yet
      target: { logical: 80, verbal: 75 }, // verbal has no baseline either
    });
    expect(result.perDimension).toHaveLength(0);
    expect(result.overall).toBe(0);
    expect(result.confidence).toBe("LOW");
  });

  it("weights higher-relevance dimensions more heavily in the overall figure", () => {
    const result = computeProgress({
      baseline: { logical: 50, verbal: 50 },
      latest: { logical: 50, verbal: 100 }, // verbal maxed out, logical untouched
      target: { logical: 100, verbal: 100 },
      weights: { logical: 5, verbal: 0.1 }, // logical matters much more to this goal
    });
    // Verbal is 100% done but barely weighted, logical is 0% done but
    // heavily weighted - overall should stay low, not ~50%.
    expect(result.overall).toBeLessThan(20);
  });
});
