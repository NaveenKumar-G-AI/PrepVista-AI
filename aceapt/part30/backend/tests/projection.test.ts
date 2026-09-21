import { describe, it, expect } from "vitest";
import { formatProjection } from "../src/engine/projection.js";

describe("formatProjection", () => {
  it("never states a specific date -- only a week-range label (Section 37)", () => {
    const result = formatProjection({ weeksLow: 6, weeksHigh: 8, confidence: "MEDIUM", basis: "test" });
    expect(result.windowLabel).toBe("approximately 6-8 weeks");
    expect(result.windowLabel).not.toMatch(/\d{4}|january|february|march|april|may|june|july|august|september|october|november|december/i);
  });

  it("communicates insufficient data honestly instead of fabricating a window", () => {
    const result = formatProjection({ weeksLow: null, weeksHigh: null, confidence: "LOW", basis: "not enough history" });
    expect(result.weeksLow).toBeNull();
    expect(result.windowLabel.toLowerCase()).toContain("not enough evidence");
  });

  it("collapses to a single-week label when low and high round to the same week", () => {
    const result = formatProjection({ weeksLow: 3.1, weeksHigh: 3.4, confidence: "HIGH", basis: "test" });
    expect(result.windowLabel).toBe("approximately 3 weeks");
  });

  it("reports target-already-met distinctly from a real projection", () => {
    const result = formatProjection({ weeksLow: 0, weeksHigh: 0, confidence: "HIGH", basis: "test" });
    expect(result.windowLabel).toBe("Target readiness already met.");
  });
});
