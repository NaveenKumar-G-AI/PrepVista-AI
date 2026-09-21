/**
 * Small, dependency-free statistics helpers shared by every deterministic
 * engine. Kept separate so each engine stays readable and so these
 * primitives are unit-tested once instead of re-verified per engine.
 */

export interface TimeSeriesPoint {
  timestamp: string | Date;
  value: number;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function toWeekOffsets(points: TimeSeriesPoint[]): { t: number; v: number }[] {
  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  if (sorted.length === 0) return [];
  const t0 = new Date(sorted[0].timestamp).getTime();
  return sorted.map((p) => ({
    t: (new Date(p.timestamp).getTime() - t0) / MS_PER_WEEK,
    v: p.value,
  }));
}

/** Ordinary least-squares slope, in units of `value` per week. */
export function linearRegressionSlope(points: TimeSeriesPoint[]): number | null {
  const xy = toWeekOffsets(points);
  const n = xy.length;
  if (n < 2) return null;
  const meanT = xy.reduce((s, p) => s + p.t, 0) / n;
  const meanV = xy.reduce((s, p) => s + p.v, 0) / n;
  const num = xy.reduce((s, p) => s + (p.t - meanT) * (p.v - meanV), 0);
  const den = xy.reduce((s, p) => s + (p.t - meanT) ** 2, 0);
  if (den === 0) return 0; // all points effectively at the same timestamp
  return num / den;
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (!m) return 0;
  return stdev(values) / Math.abs(m);
}

/** Splits a sorted series into first/second half (1-pt overlap) and returns each half's slope. */
export function splitHalfSlopes(points: TimeSeriesPoint[]): { first: number | null; second: number | null } {
  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  if (sorted.length < 4) return { first: null, second: null };
  const mid = Math.ceil(sorted.length / 2);
  return {
    first: linearRegressionSlope(sorted.slice(0, mid)),
    second: linearRegressionSlope(sorted.slice(mid - 1)),
  };
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Coefficient of variation of the RESIDUALS after removing a linear
 * trend - i.e. how noisy the series is once the trend itself is
 * accounted for. Plain coefficientOfVariation() over raw values isn't
 * safe to use as a "is this trend real or just noise" gate: a clean
 * monotonic rise (42,57,71,83) is far from its own flat mean at both
 * ends purely because it's rising, not because it's noisy - detrending
 * first is what separates "trending" from "unstable".
 */
export function residualCoefficientOfVariation(points: TimeSeriesPoint[]): number | null {
  const xy = toWeekOffsets(points);
  if (xy.length < 3) return null;
  const slope = linearRegressionSlope(points);
  if (slope === null) return null;
  const meanT = mean(xy.map((p) => p.t));
  const meanV = mean(xy.map((p) => p.v));
  const intercept = meanV - slope * meanT;
  const residuals = xy.map((p) => p.v - (slope * p.t + intercept));
  if (meanV === 0) return 0;
  return stdev(residuals) / Math.abs(meanV);
}
