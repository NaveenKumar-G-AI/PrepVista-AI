import type { GrowthEvidence, TrendDirection } from "../types.ts";
import { GrowthConfig } from "../config.ts";
import { splitBaselineVsRecent, mean } from "../utils.ts";

export interface IndependenceResult {
  trend: TrendDirection;
  baselineMeanAssistance: number | null;
  recentMeanAssistance: number | null;
}

/**
 * Independence is about whether performance holds up as assistance drops —
 * not simply "did assistance drop". A student solving fewer problems with
 * less help isn't independence growth if their success rate collapsed too;
 * this module reports the assistance trend, and callers (state detection /
 * insights) are responsible for reading it alongside the success-rate trend
 * rather than in isolation, per spec: "do not punish assistance
 * automatically — use it to understand independence."
 */
export function analyzeIndependence(dimensionEvidence: GrowthEvidence[], now: Date = new Date()): IndependenceResult {
  const cfg = GrowthConfig;
  const scale = cfg.independence.assistanceScale;
  const { baseline, recent } = splitBaselineVsRecent(
    dimensionEvidence,
    cfg.evidence.recentWindowDays,
    cfg.evidence.minBaselineSeparationDays,
    now,
  );

  if (baseline.length === 0 || recent.length === 0) {
    return { trend: "UNKNOWN", baselineMeanAssistance: null, recentMeanAssistance: null };
  }

  const baselineMean = mean(baseline.map((e) => scale[e.assistanceLevel]));
  const recentMean = mean(recent.map((e) => scale[e.assistanceLevel]));
  const drop = baselineMean - recentMean;

  const recentSuccessRate = recent.filter((e) => e.outcome === "SUCCESS").length / recent.length;
  const performanceHeld = recentSuccessRate >= 0.6;

  let trend: TrendDirection = "FLAT";
  if (drop >= cfg.independence.minAssistanceDropForImprovement && performanceHeld) trend = "POSITIVE";
  else if (recentMean - baselineMean >= cfg.independence.minAssistanceDropForImprovement) trend = "NEGATIVE";

  return {
    trend,
    baselineMeanAssistance: Number(baselineMean.toFixed(2)),
    recentMeanAssistance: Number(recentMean.toFixed(2)),
  };
}
