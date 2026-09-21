/**
 * The forecast engine answers: "if current behavior and trajectory continue,
 * what's the likely readiness range?" (section 17) — always as a range, never
 * fake-precision decimals, and always paired with an explicit confidence
 * level and status (sections 17, 18, 20).
 *
 * Status is a deterministic decision tree over trend + gap + confidence —
 * never left to an LLM to decide (section 56).
 */
import type {
  CapabilityDimensionKey,
  ConfidenceLevel,
  EvidenceConfidenceResult,
  ForecastRange,
  ForecastResult,
  ReadinessState,
  TrendResult,
} from "../domain/types.js";
import { clamp, round } from "../utils/format.js";

const BASE_BAND = 3; // points, at HIGH confidence with a short horizon
const BAND_MULTIPLIER: Record<ConfidenceLevel, number> = {
  HIGH: 1,
  MEDIUM: 1.6,
  LOW: 2.4,
  INSUFFICIENT: 3.2,
};
const HORIZON_BAND_CAP = 6; // points, max extra band added purely for a long horizon

export interface GenerateForecastInput {
  studentId: string;
  current: number;
  target: number;
  trend: TrendResult;
  confidence: EvidenceConfidenceResult;
  /** Days until the configured assessment date, or null if none is set. */
  daysRemaining: number | null;
  /** Observed cadence, used only for the optional effort estimate (section 21). */
  avgSessionsPerWeek?: number | null;
  defaultHorizonWeeks?: number;
  mainFactor?: CapabilityDimensionKey | null;
  now?: Date;
}

function computeStatus(
  current: number,
  target: number,
  trend: TrendResult,
  confidence: EvidenceConfidenceResult,
  projectedRange: ForecastRange,
): ReadinessState {
  if (confidence.level === "INSUFFICIENT") return "NOT_ENOUGH_EVIDENCE";
  if (current >= target) return "TARGET_REACHED";
  if (trend.trend === "STABILITY") return "STABLE";
  if (trend.trend === "IMPROVEMENT" || trend.trend === "BREAKTHROUGH") {
    return projectedRange.high >= target ? "ON_TRACK" : "IMPROVING";
  }
  if (trend.trend === "STAGNATION" || trend.trend === "REGRESSION") return "AT_RISK";
  // trend is INSUFFICIENT_DATA but there was enough overall evidence to not
  // be NOT_ENOUGH_EVIDENCE (e.g. many observations clustered on one day).
  return "DEVELOPING";
}

export function generateForecast(input: GenerateForecastInput): ForecastResult {
  const {
    studentId,
    current,
    target,
    trend,
    confidence,
    daysRemaining,
    avgSessionsPerWeek,
    defaultHorizonWeeks = 3,
    mainFactor = null,
    now = new Date(),
  } = input;

  const weeksRemaining = daysRemaining != null ? Math.max(daysRemaining, 0) / 7 : defaultHorizonWeeks;
  const slopePerWeek = trend.slopePerWeek ?? 0;
  const projectedMid = clamp(current + slopePerWeek * weeksRemaining);

  let band = BASE_BAND * BAND_MULTIPLIER[confidence.level];
  if (trend.trend === "INSUFFICIENT_DATA") band += 2;
  band += Math.min(weeksRemaining * 0.4, HORIZON_BAND_CAP);

  const lowRaw = clamp(round(projectedMid - band));
  const highRaw = clamp(round(projectedMid + band));
  const projectedRange: ForecastRange = { low: Math.min(lowRaw, highRaw), high: Math.max(lowRaw, highRaw) };

  const status = computeStatus(current, target, trend, confidence, projectedRange);

  let estimatedEffortSessions: ForecastRange | null = null;
  if (current < target && slopePerWeek > 0.1 && avgSessionsPerWeek && avgSessionsPerWeek > 0) {
    const gap = target - current;
    const weeksNeeded = gap / slopePerWeek;
    const sessionsNeeded = weeksNeeded * avgSessionsPerWeek;
    if (Number.isFinite(sessionsNeeded) && sessionsNeeded > 0) {
      estimatedEffortSessions = {
        low: Math.max(1, Math.round(sessionsNeeded * 0.8)),
        high: Math.max(1, Math.round(sessionsNeeded * 1.3)),
      };
    }
  }

  return {
    studentId,
    generatedAt: now.toISOString(),
    current: round(clamp(current)),
    target: round(clamp(target)),
    projectedRange,
    status,
    confidence,
    mainFactor,
    daysRemaining: daysRemaining != null ? Math.round(daysRemaining) : null,
    estimatedEffortSessions,
  };
}
