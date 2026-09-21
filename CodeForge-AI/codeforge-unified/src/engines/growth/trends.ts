import type { Confidence } from "./types";

export interface TimePoint {
  value: number;
  observedAt: string;
}

function byTime(a: TimePoint, b: TimePoint): number {
  return new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime();
}

function daysBetween(aIso: string, bIso: string): number {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / (1000 * 60 * 60 * 24);
}

/** Least-squares slope of value against elapsed days since the first point. */
function leastSquaresSlopePerDay(points: TimePoint[]): number {
  const t0 = new Date(points[0]!.observedAt).getTime();
  const xs = points.map((p) => (new Date(p.observedAt).getTime() - t0) / (1000 * 60 * 60 * 24));
  const ys = points.map((p) => p.value);
  const n = points.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i]! - xMean) * (ys[i]! - yMean);
    denominator += (xs[i]! - xMean) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

// ---------------------------------------------------------------------------
// VELOCITY
// ---------------------------------------------------------------------------

export interface VelocityResult {
  status: "CALCULATED" | "INSUFFICIENT_EVIDENCE";
  perWeek?: number;
  confidence?: Confidence;
}

const MIN_POINTS_FOR_VELOCITY = 3;
const MIN_SPAN_DAYS_FOR_VELOCITY = 10;

/**
 * Rate of validated capability change per week, fit by linear regression
 * over the observation history (not a naive "last minus first" delta,
 * which is easily distorted by a single outlier observation).
 */
export function calculateVelocity(points: TimePoint[]): VelocityResult {
  const sorted = [...points].sort(byTime);
  if (sorted.length < MIN_POINTS_FOR_VELOCITY) return { status: "INSUFFICIENT_EVIDENCE" };

  const spanDays = daysBetween(sorted[0]!.observedAt, sorted[sorted.length - 1]!.observedAt);
  if (spanDays < MIN_SPAN_DAYS_FOR_VELOCITY) return { status: "INSUFFICIENT_EVIDENCE" };

  const perWeek = Math.round(leastSquaresSlopePerDay(sorted) * 7 * 100) / 100;
  const confidence: Confidence =
    sorted.length >= 6 ? "HIGH" : sorted.length >= 4 ? "MODERATE" : "LOW";

  return { status: "CALCULATED", perWeek, confidence };
}

// ---------------------------------------------------------------------------
// ACCELERATION
// ---------------------------------------------------------------------------

export interface AccelerationResult {
  status: "ACCELERATING" | "DECELERATING" | "STEADY" | "INSUFFICIENT_EVIDENCE";
  periodVelocities?: number[];
}

/** Change in period-over-period velocity smaller than this is treated as noise, not a trend. */
const ACCELERATION_NOISE_THRESHOLD_PER_WEEK = 1.0;

/**
 * Splits the history into three chronological periods and compares their
 * velocities. Both consecutive deltas must clear the noise threshold in
 * the same direction before this calls it acceleration or deceleration.
 */
export function calculateAcceleration(points: TimePoint[]): AccelerationResult {
  const sorted = [...points].sort(byTime);
  if (sorted.length < 6) return { status: "INSUFFICIENT_EVIDENCE" };

  const third = Math.floor(sorted.length / 3);
  const periods = [sorted.slice(0, third), sorted.slice(third, third * 2), sorted.slice(third * 2)];
  if (periods.some((p) => p.length < 2)) return { status: "INSUFFICIENT_EVIDENCE" };

  const periodVelocities = periods.map(
    (p) => Math.round(leastSquaresSlopePerDay(p) * 7 * 100) / 100
  );
  const [v1, v2, v3] = periodVelocities as [number, number, number];
  const d1 = v2 - v1;
  const d2 = v3 - v2;

  if (d1 > ACCELERATION_NOISE_THRESHOLD_PER_WEEK && d2 > ACCELERATION_NOISE_THRESHOLD_PER_WEEK) {
    return { status: "ACCELERATING", periodVelocities };
  }
  if (d1 < -ACCELERATION_NOISE_THRESHOLD_PER_WEEK && d2 < -ACCELERATION_NOISE_THRESHOLD_PER_WEEK) {
    return { status: "DECELERATING", periodVelocities };
  }
  return { status: "STEADY", periodVelocities };
}

// ---------------------------------------------------------------------------
// PLATEAU
// ---------------------------------------------------------------------------

export interface PlateauResult {
  status: "PLATEAU" | "NOT_PLATEAU" | "INSUFFICIENT_EVIDENCE";
  recentRange?: number;
}

const MIN_POINTS_FOR_PLATEAU = 4;
const MIN_SPAN_DAYS_FOR_PLATEAU = 21;
/** Max-min spread within the recent window, in score points, still counted as "flat". */
const PLATEAU_RANGE_THRESHOLD = 4;

export function detectPlateau(points: TimePoint[]): PlateauResult {
  const sorted = [...points].sort(byTime);
  if (sorted.length < MIN_POINTS_FOR_PLATEAU) return { status: "INSUFFICIENT_EVIDENCE" };

  const spanDays = daysBetween(sorted[0]!.observedAt, sorted[sorted.length - 1]!.observedAt);
  if (spanDays < MIN_SPAN_DAYS_FOR_PLATEAU) return { status: "INSUFFICIENT_EVIDENCE" };

  const recentWindow = sorted.slice(-MIN_POINTS_FOR_PLATEAU);
  const values = recentWindow.map((p) => p.value);
  const recentRange = Math.max(...values) - Math.min(...values);

  return {
    status: recentRange <= PLATEAU_RANGE_THRESHOLD ? "PLATEAU" : "NOT_PLATEAU",
    recentRange,
  };
}
