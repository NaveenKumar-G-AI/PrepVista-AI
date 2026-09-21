/**
 * §51 — "Do not focus only on mean accuracy. Compare consistency." Given a
 * chronological series of per-session (or per-window) accuracy percentages,
 * this reports variance alongside the mean so a volatile 95/70/98/75 student
 * isn't treated the same as a steady 95/94/96/95 student just because their
 * averages are similar.
 */
export type ConsistencyLabel = "insufficient_evidence" | "stable" | "somewhat_variable" | "highly_variable";

export interface StabilityResult {
  mean: number | null;
  stdDev: number | null;
  sampleSize: number;
  consistency: ConsistencyLabel;
}

const MIN_POINTS_FOR_STABILITY = 3;
const STABLE_STDDEV_MAX = 5;
const SOMEWHAT_VARIABLE_STDDEV_MAX = 12;

export function computeStability(accuracyPercentSeries: number[]): StabilityResult {
  const n = accuracyPercentSeries.length;
  if (n < MIN_POINTS_FOR_STABILITY) {
    return { mean: null, stdDev: null, sampleSize: n, consistency: "insufficient_evidence" };
  }

  const mean = accuracyPercentSeries.reduce((a, b) => a + b, 0) / n;
  const variance =
    accuracyPercentSeries.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  let consistency: ConsistencyLabel;
  if (stdDev <= STABLE_STDDEV_MAX) consistency = "stable";
  else if (stdDev <= SOMEWHAT_VARIABLE_STDDEV_MAX) consistency = "somewhat_variable";
  else consistency = "highly_variable";

  return {
    mean: Math.round(mean * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    sampleSize: n,
    consistency
  };
}
