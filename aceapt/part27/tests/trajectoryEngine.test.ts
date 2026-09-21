import { describe, expect, it } from "vitest";
import { computeMomentum, detectTrend } from "../src/engines/trajectoryEngine.js";
import type { SeriesPoint } from "../src/domain/types.js";

function series(valuesOldToNew: number[], stepDays = 7): SeriesPoint[] {
  const base = new Date("2026-01-01T00:00:00.000Z").getTime();
  return valuesOldToNew.map((value, i) => ({
    date: new Date(base + i * stepDays * 86_400_000).toISOString(),
    value,
  }));
}

describe("detectTrend", () => {
  it("reports INSUFFICIENT_DATA below the minimum point count", () => {
    const result = detectTrend("transfer", series([50, 55]));
    expect(result.trend).toBe("INSUFFICIENT_DATA");
    expect(result.slopePerWeek).toBeNull();
  });

  it("classifies a clearly rising series as IMPROVEMENT (spec section 14)", () => {
    const result = detectTrend("transfer", series([48, 55, 61, 68]));
    expect(result.trend).toBe("IMPROVEMENT");
    expect(result.slopePerWeek).toBeGreaterThan(0);
  });

  it("classifies a flat series with a real gap-to-target as STAGNATION (spec section 24)", () => {
    const result = detectTrend("consistency", series([72, 73, 72, 74, 73, 72]), 8);
    expect(result.trend).toBe("STAGNATION");
    expect(result.investigatePrompts?.length ?? 0).toBeGreaterThan(0);
  });

  it("classifies the same flat shape as STABILITY when there's no meaningful gap", () => {
    const result = detectTrend("retention", series([80, 81, 82, 81, 82]), 1);
    expect(result.trend).toBe("STABILITY");
  });

  it("classifies a clearly falling series as REGRESSION, with things to investigate rather than a bare verdict", () => {
    const result = detectTrend("mastery", series([82, 80, 77, 72]));
    expect(result.trend).toBe("REGRESSION");
    expect(result.investigatePrompts?.length ?? 0).toBeGreaterThan(0);
    expect(result.explanation).not.toMatch(/you are getting worse/i);
  });

  it("classifies a late sharp acceleration as BREAKTHROUGH (spec section 26)", () => {
    const result = detectTrend("transfer", series([58, 61, 63, 64, 77, 81, 84]));
    expect(result.trend).toBe("BREAKTHROUGH");
  });

  it("never reports a trend for a dimension with too few points, even with a huge apparent gap", () => {
    const result = detectTrend("speed", series([40, 90]), 40);
    expect(result.trend).toBe("INSUFFICIENT_DATA");
  });
});

describe("computeMomentum", () => {
  it("returns INSUFFICIENT_DATA with fewer than 4 points", () => {
    expect(computeMomentum(series([50, 55, 60]))).toBe("INSUFFICIENT_DATA");
  });

  it("detects STRONG_POSITIVE momentum when the second half accelerates sharply", () => {
    expect(computeMomentum(series([50, 51, 60, 72]))).toBe("STRONG_POSITIVE");
  });

  it("detects NEGATIVE momentum on a steadily falling series", () => {
    expect(computeMomentum(series([80, 76, 72, 68]))).toBe("NEGATIVE");
  });

  it("detects SLOWING momentum when a clear rise loses steam", () => {
    expect(computeMomentum(series([50, 60, 70, 71]))).toBe("SLOWING");
  });
});
