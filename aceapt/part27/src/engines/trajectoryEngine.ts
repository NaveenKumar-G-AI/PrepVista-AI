/**
 * Trajectory engine (spec sections 14, 22-26).
 *
 * Classifies a chronological series of observations into one of:
 *   IMPROVEMENT / STABILITY / STAGNATION / REGRESSION / BREAKTHROUGH / INSUFFICIENT_DATA
 *
 * Design note worth being explicit about (the spec gives examples but not a
 * formula): a flat series is labeled STABILITY when the student is already
 * at/near target, and STAGNATION when there's still a meaningful gap to close
 * — same underlying shape, different meaning depending on context. This
 * mirrors the spec's own examples (14 & 24 both show the same flat pattern;
 * 24 explicitly calls it stagnation because there's a target still to reach).
 * All thresholds below are named constants so they're one place to tune once
 * there's real product/data-science calibration — not empirical constants.
 */
import type { CapabilityDimensionKey, MomentumState, SeriesPoint, TrendResult, TrendType } from "../domain/types.js";
import { DIMENSION_DISPLAY_NAMES } from "../domain/constants.js";
import { dayOffsets } from "../utils/dates.js";
import { round1 } from "../utils/format.js";

const MIN_POINTS_FOR_TREND = 3;
const MIN_POINTS_FOR_BREAKTHROUGH_CHECK = 5;
const MIN_POINTS_FOR_MOMENTUM = 4;
const NOISE_THRESHOLD_PER_WEEK = 1.5; // |slope| below this = no meaningful movement
const BREAKTHROUGH_ACCEL_MULTIPLIER = 2; // 2nd-half slope must beat 1st-half slope by this much
const BREAKTHROUGH_MIN_SLOPE_PER_WEEK = 3; // ...and be at least this steep on its own
const STAGNATION_GAP_THRESHOLD = 3; // flat + gap-to-target above this => stagnation, else stability

const REGRESSION_CHECKLIST = [
  "a recent difficulty change",
  "more novel/unfamiliar questions than usual",
  "added time pressure",
  "a shift in topic mix",
  "retention decay since the last session",
  "possible fatigue",
  "different assessment conditions",
  "ordinary statistical variation in a small sample",
];

const STAGNATION_CHECKLIST = [
  "whether the current intervention is the right one",
  "repetitive practice without enough variation",
  "practice sitting at the wrong difficulty level",
  "a transfer limitation (works in practice, not in new contexts)",
  "a speed bottleneck masking otherwise-correct understanding",
  "a persistent misconception that keeps resurfacing",
];

type Shape = "RISING" | "FLAT" | "FALLING" | "SPIKE" | "INSUFFICIENT_DATA";

function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - xMean) * (ys[i]! - yMean);
    den += (xs[i]! - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: yMean - slope * xMean };
}

function slopePerWeekOf(points: SeriesPoint[]): number {
  if (points.length < 2) return 0;
  const xs = dayOffsets(points);
  const ys = points.map((p) => p.value);
  return linearRegression(xs, ys).slope * 7;
}

function computeShape(points: SeriesPoint[]): { shape: Shape; slopePerWeek: number } {
  if (points.length < MIN_POINTS_FOR_TREND) {
    return { shape: "INSUFFICIENT_DATA", slopePerWeek: 0 };
  }

  const overallSlope = slopePerWeekOf(points);

  if (points.length >= MIN_POINTS_FOR_BREAKTHROUGH_CHECK) {
    const mid = Math.floor(points.length / 2);
    const firstHalf = points.slice(0, mid);
    const secondHalf = points.slice(mid);
    const slopeFirst = slopePerWeekOf(firstHalf);
    const slopeSecond = slopePerWeekOf(secondHalf);
    const accelerating =
      slopeSecond >= BREAKTHROUGH_MIN_SLOPE_PER_WEEK &&
      (slopeFirst <= 0 || slopeSecond >= slopeFirst * BREAKTHROUGH_ACCEL_MULTIPLIER);
    if (accelerating) {
      return { shape: "SPIKE", slopePerWeek: overallSlope };
    }
  }

  if (Math.abs(overallSlope) < NOISE_THRESHOLD_PER_WEEK) {
    return { shape: "FLAT", slopePerWeek: overallSlope };
  }
  return { shape: overallSlope > 0 ? "RISING" : "FALLING", slopePerWeek: overallSlope };
}

function explainTrend(
  dimension: CapabilityDimensionKey | "overall",
  trend: TrendType,
  slopePerWeek: number | null,
): string {
  const label = dimension === "overall" ? "Overall readiness" : DIMENSION_DISPLAY_NAMES[dimension];
  switch (trend) {
    case "IMPROVEMENT":
      return `${label} has been improving, gaining roughly ${round1(Math.abs(slopePerWeek ?? 0))} points per week over the observed period.`;
    case "BREAKTHROUGH":
      return `${label} shows a marked recent jump beyond the prior trend — a faster gain than the earlier pattern would predict.`;
    case "STAGNATION":
      return `${label} has remained broadly stable rather than showing sustained improvement, despite an existing gap to target.`;
    case "STABILITY":
      return `${label} has remained steady at or near the target level.`;
    case "REGRESSION":
      return `${label} has declined over the observed period. That's worth a closer look rather than an immediate conclusion.`;
    case "INSUFFICIENT_DATA":
    default:
      return `Not enough observations yet to determine a trend for ${label.toLowerCase()}.`;
  }
}

/**
 * @param gapToTarget target - current for this dimension, if known. Determines
 *   whether a flat trend reads as STAGNATION (gap remains) or STABILITY
 *   (already there). Omit when no target is configured for this dimension.
 */
export function detectTrend(
  dimension: CapabilityDimensionKey | "overall",
  points: SeriesPoint[],
  gapToTarget?: number,
): TrendResult {
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const { shape, slopePerWeek } = computeShape(sorted);

  let trend: TrendType;
  let investigatePrompts: string[] | undefined;

  switch (shape) {
    case "INSUFFICIENT_DATA":
      trend = "INSUFFICIENT_DATA";
      break;
    case "SPIKE":
      trend = "BREAKTHROUGH";
      break;
    case "RISING":
      trend = "IMPROVEMENT";
      break;
    case "FALLING":
      trend = "REGRESSION";
      investigatePrompts = REGRESSION_CHECKLIST;
      break;
    case "FLAT":
    default:
      if (gapToTarget != null && gapToTarget > STAGNATION_GAP_THRESHOLD) {
        trend = "STAGNATION";
        investigatePrompts = STAGNATION_CHECKLIST;
      } else {
        trend = "STABILITY";
      }
      break;
  }

  const result: TrendResult = {
    dimension,
    trend,
    momentum: computeMomentum(sorted),
    slopePerWeek: shape === "INSUFFICIENT_DATA" ? null : round1(slopePerWeek),
    observations: sorted.length,
    explanation: explainTrend(dimension, trend, shape === "INSUFFICIENT_DATA" ? null : slopePerWeek),
  };
  if (investigatePrompts) result.investigatePrompts = investigatePrompts;
  return result;
}

export function computeMomentum(points: SeriesPoint[]): MomentumState {
  if (points.length < MIN_POINTS_FOR_MOMENTUM) return "INSUFFICIENT_DATA";
  const mid = Math.floor(points.length / 2);
  const slopeFirst = slopePerWeekOf(points.slice(0, mid));
  const slopeSecond = slopePerWeekOf(points.slice(mid));

  if (slopeSecond >= NOISE_THRESHOLD_PER_WEEK * 2 && slopeSecond >= slopeFirst * 1.4) {
    return "STRONG_POSITIVE";
  }
  if (slopeSecond >= NOISE_THRESHOLD_PER_WEEK) {
    if (slopeFirst > NOISE_THRESHOLD_PER_WEEK && slopeSecond < slopeFirst * 0.6) return "SLOWING";
    return "POSITIVE";
  }
  if (slopeSecond <= -NOISE_THRESHOLD_PER_WEEK) return "NEGATIVE";
  if (slopeFirst > NOISE_THRESHOLD_PER_WEEK && slopeSecond < NOISE_THRESHOLD_PER_WEEK) return "SLOWING";
  return "STABLE";
}
