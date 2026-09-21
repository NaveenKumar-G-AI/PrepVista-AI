import { describe, expect, it } from "vitest";
import { generateForecast } from "../src/engines/forecastEngine.js";
import type { EvidenceConfidenceResult, TrendResult } from "../src/domain/types.js";

function trend(overrides: Partial<TrendResult> = {}): TrendResult {
  return {
    dimension: "overall",
    trend: "IMPROVEMENT",
    momentum: "POSITIVE",
    slopePerWeek: 3,
    observations: 5,
    explanation: "test trend",
    ...overrides,
  };
}

function confidence(level: EvidenceConfidenceResult["level"] = "HIGH"): EvidenceConfidenceResult {
  return { level, score: level === "HIGH" ? 0.8 : 0.3, reasons: [] };
}

describe("generateForecast status", () => {
  it("returns NOT_ENOUGH_EVIDENCE when confidence is insufficient, regardless of trend", () => {
    const result = generateForecast({
      studentId: "s1",
      current: 76,
      target: 82,
      trend: trend(),
      confidence: confidence("INSUFFICIENT"),
      daysRemaining: 15,
    });
    expect(result.status).toBe("NOT_ENOUGH_EVIDENCE");
  });

  it("returns TARGET_REACHED when current already meets target", () => {
    const result = generateForecast({
      studentId: "s1",
      current: 85,
      target: 82,
      trend: trend(),
      confidence: confidence(),
      daysRemaining: 15,
    });
    expect(result.status).toBe("TARGET_REACHED");
  });

  it("returns AT_RISK for a stagnating trend with a real remaining gap", () => {
    const result = generateForecast({
      studentId: "s1",
      current: 72,
      target: 80,
      trend: trend({ trend: "STAGNATION", slopePerWeek: 0.2 }),
      confidence: confidence(),
      daysRemaining: 10,
    });
    expect(result.status).toBe("AT_RISK");
  });

  it("distinguishes ON_TRACK (projection reaches target) from IMPROVING (it doesn't, yet)", () => {
    const fastImprovement = generateForecast({
      studentId: "s1",
      current: 76,
      target: 78,
      trend: trend({ slopePerWeek: 8 }),
      confidence: confidence("HIGH"),
      daysRemaining: 21,
    });
    const slowImprovement = generateForecast({
      studentId: "s1",
      current: 60,
      target: 90,
      trend: trend({ slopePerWeek: 0.5 }),
      confidence: confidence("HIGH"),
      daysRemaining: 14,
    });
    expect(fastImprovement.status).toBe("ON_TRACK");
    expect(slowImprovement.status).toBe("IMPROVING");
  });
});

describe("generateForecast numeric hygiene", () => {
  it("never returns fake-precision decimals (spec section 17)", () => {
    const result = generateForecast({
      studentId: "s1",
      current: 76.4,
      target: 82,
      trend: trend(),
      confidence: confidence(),
      daysRemaining: 15,
    });
    expect(Number.isInteger(result.current)).toBe(true);
    expect(Number.isInteger(result.projectedRange.low)).toBe(true);
    expect(Number.isInteger(result.projectedRange.high)).toBe(true);
  });

  it("widens the uncertainty band as confidence drops", () => {
    const high = generateForecast({
      studentId: "s1",
      current: 76,
      target: 82,
      trend: trend(),
      confidence: confidence("HIGH"),
      daysRemaining: 15,
    });
    const low = generateForecast({
      studentId: "s1",
      current: 76,
      target: 82,
      trend: trend(),
      confidence: confidence("LOW"),
      daysRemaining: 15,
    });
    const band = (r: typeof high) => r.projectedRange.high - r.projectedRange.low;
    expect(band(low)).toBeGreaterThan(band(high));
  });

  it("only offers an effort estimate when there's a real positive trend and known cadence", () => {
    const withCadence = generateForecast({
      studentId: "s1",
      current: 70,
      target: 82,
      trend: trend({ slopePerWeek: 2 }),
      confidence: confidence(),
      daysRemaining: 30,
      avgSessionsPerWeek: 4,
    });
    const withoutCadence = generateForecast({
      studentId: "s1",
      current: 70,
      target: 82,
      trend: trend({ slopePerWeek: 2 }),
      confidence: confidence(),
      daysRemaining: 30,
    });
    expect(withCadence.estimatedEffortSessions).not.toBeNull();
    expect(withoutCadence.estimatedEffortSessions).toBeNull();
  });
});
