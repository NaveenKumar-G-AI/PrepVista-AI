// Small, dependency-free statistics helpers used by the mastery decision
// engine. Kept pure and unit-tested (see src/__tests__/stats.test.ts) because
// every mastery decision ultimately rests on these functions being correct.

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Exponential recency-weighted mean. `scores` must be ordered oldest -> newest.
 * halfLife controls how many steps back a score's influence halves - a smaller
 * halfLife makes the score react faster to recent evidence, a larger one
 * smooths over noise. Chosen instead of a flat "last N" average so a single
 * lucky/unlucky attempt can't dominate, and so the score is always defined
 * (down-weighted, not discarded) rather than needing an arbitrary cutoff.
 */
export function recencyWeightedMean(scores: number[], halfLife = 3): number {
  if (scores.length === 0) return NaN;
  let weightedSum = 0;
  let weightTotal = 0;
  const n = scores.length;
  for (let i = 0; i < n; i++) {
    const age = n - 1 - i; // 0 = most recent
    const weight = Math.pow(0.5, age / halfLife);
    weightedSum += scores[i] * weight;
    weightTotal += weight;
  }
  return weightedSum / weightTotal;
}

/**
 * Ordinary-least-squares slope of `values` (oldest -> newest) against
 * `xValues` (e.g. days since first evidence). Used by the retention engine
 * to distinguish "gently declining but still retained" from "actively
 * forgetting" - see RetentionService.
 */
export function linearSlope(xValues: number[], values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = mean(xValues);
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xValues[i] - xMean) * (values[i] - yMean);
    den += (xValues[i] - xMean) ** 2;
  }
  if (den === 0) return 0;
  return num / den;
}

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}
