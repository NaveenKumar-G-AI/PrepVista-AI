import { describe, expect, it } from "vitest";
import { determineMainFactor, identifyRisks } from "../src/engines/riskEngine.js";
import type { EvidenceConfidenceResult, GapItem, TrendResult } from "../src/domain/types.js";

function trend(overrides: Partial<TrendResult> = {}): TrendResult {
  return {
    dimension: "overall",
    trend: "IMPROVEMENT",
    momentum: "POSITIVE",
    slopePerWeek: 3,
    observations: 8,
    explanation: "t",
    ...overrides,
  };
}

const highConfidence: EvidenceConfidenceResult = { level: "HIGH", score: 0.8, reasons: [] };

describe("identifyRisks", () => {
  it("ranks a large transfer gap above a small speed gap (spec section 31's worked numbers)", () => {
    const gaps: GapItem[] = [
      { dimension: "transfer", current: 61, target: 75, gap: 14 },
      { dimension: "speed", current: 73, target: 78, gap: 5 },
    ];
    const risks = identifyRisks({
      gaps,
      overallTrend: trend(),
      dimensionTrends: [],
      confidence: highConfidence,
      practiceAssessmentGap: null,
      failureBoundary: null,
      currentOverall: 75,
      targetOverall: 82,
      forecastRange: { low: 78, high: 81 },
    });
    expect(risks[0]?.type).toBe("TRANSFER_GAP");
  });

  it("ignores gaps below the significance threshold", () => {
    const gaps: GapItem[] = [{ dimension: "speed", current: 76, target: 78, gap: 2 }];
    const risks = identifyRisks({
      gaps,
      overallTrend: trend(),
      dimensionTrends: [],
      confidence: highConfidence,
      practiceAssessmentGap: null,
      failureBoundary: null,
      currentOverall: 80,
      targetOverall: 82,
      forecastRange: { low: 80, high: 84 },
    });
    expect(risks.find((r) => r.type === "SPEED_LIMITATION")).toBeUndefined();
  });

  it("flags INSUFFICIENT_EVIDENCE when confidence is low, explained from the real confidence reasons", () => {
    const risks = identifyRisks({
      gaps: [],
      overallTrend: trend({ trend: "INSUFFICIENT_DATA", slopePerWeek: null }),
      dimensionTrends: [],
      confidence: { level: "LOW", score: 0.3, reasons: ["Only 4 observations so far."] },
      practiceAssessmentGap: null,
      failureBoundary: null,
      currentOverall: 70,
      targetOverall: 82,
      forecastRange: null,
    });
    const risk = risks.find((r) => r.type === "INSUFFICIENT_EVIDENCE");
    expect(risk?.explanation).toBe("Only 4 observations so far.");
  });

  it("flags SLOW_TRAJECTORY when improving but the projected range still falls short of target", () => {
    const risks = identifyRisks({
      gaps: [],
      overallTrend: trend({ trend: "IMPROVEMENT" }),
      dimensionTrends: [],
      confidence: highConfidence,
      practiceAssessmentGap: null,
      failureBoundary: null,
      currentOverall: 70,
      targetOverall: 90,
      forecastRange: { low: 74, high: 78 },
    });
    expect(risks.some((r) => r.type === "SLOW_TRAJECTORY")).toBe(true);
  });
});

describe("determineMainFactor", () => {
  it("prefers the top-ranked risk's dimension over the raw largest gap when the largest gap has no mapped risk type", () => {
    const gaps: GapItem[] = [
      { dimension: "mastery", current: 70, target: 85, gap: 15 }, // largest raw gap; "mastery" has no dedicated RiskFactorType
      { dimension: "transfer", current: 68, target: 75, gap: 7 },
    ];
    const risks = identifyRisks({
      gaps,
      overallTrend: trend(),
      dimensionTrends: [],
      confidence: highConfidence,
      practiceAssessmentGap: null,
      failureBoundary: null,
      currentOverall: 75,
      targetOverall: 82,
      forecastRange: { low: 78, high: 81 },
    });
    expect(determineMainFactor(risks, gaps)).toBe("transfer");
  });

  it("falls back to the largest raw gap when no risks were generated at all", () => {
    const gaps: GapItem[] = [{ dimension: "mastery", current: 70, target: 85, gap: 15 }];
    expect(determineMainFactor([], gaps)).toBe("mastery");
  });

  it("returns null when there's nothing to point to", () => {
    expect(determineMainFactor([], [])).toBeNull();
  });
});
