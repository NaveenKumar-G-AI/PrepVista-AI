/**
 * Robust statistics primitives for Feature 55.
 *
 * Nothing in this file knows about questions, attempts, or difficulty — it is
 * pure numeric plumbing so it can be unit-tested in complete isolation from
 * the database. Every function is written to degrade gracefully on small or
 * degenerate inputs (empty arrays, all-identical values) rather than throwing,
 * because "not enough data yet" is a normal, expected state for a new
 * question (spec §69: never present sophisticated statistics as reliable on
 * a tiny sample — the caller is responsible for checking sample size before
 * trusting these outputs, but the math itself should never NaN/crash).
 */

export interface WilsonInterval {
  point: number;
  low: number;
  high: number;
}

/** 95% Wilson score interval for a proportion — far more honest than a naive
 * normal approximation at small n, and never goes below 0 or above 1. */
export function wilsonScoreInterval(successes: number, n: number, z = 1.96): WilsonInterval {
  if (n <= 0) return { point: 0, low: 0, high: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const low = (centre - margin) / denominator;
  const high = (centre + margin) / denominator;
  return {
    point: clamp01(p),
    low: clamp01(low),
    high: clamp01(high),
  };
}

/** Two-proportion z-test. Returns the z statistic and a two-tailed p-value,
 * used by the drift service to ask "is the recent facility actually
 * different from the baseline, or is this noise?" (spec §60, §62, §185). */
export function twoProportionZTest(
  successesA: number,
  nA: number,
  successesB: number,
  nB: number
): { z: number; pValue: number } {
  if (nA <= 0 || nB <= 0) return { z: 0, pValue: 1 };
  const pA = successesA / nA;
  const pB = successesB / nB;
  const pPooled = (successesA + successesB) / (nA + nB);
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / nA + 1 / nB));
  if (se === 0) return { z: 0, pValue: 1 };
  const z = (pA - pB) / se;
  const pValue = 2 * (1 - standardNormalCdf(Math.abs(z)));
  return { z, pValue };
}

/** Abramowitz-Stegun approximation of the standard normal CDF — accurate to
 * ~1e-7, which is far more precision than a difficulty drift decision needs. */
function standardNormalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 0.5, true);
}

/** Linear-interpolation percentile (like numpy's default). `sorted` inputs
 * that are already sorted can skip the re-sort via the third argument. */
export function percentile(values: number[], p: number, alreadySorted = false): number | null {
  if (values.length === 0) return null;
  const sorted = alreadySorted ? values : [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0] ?? null;
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const lowerVal = sorted[lower];
  const upperVal = sorted[upper];
  if (lowerVal === undefined || upperVal === undefined) return null;
  if (lower === upper) return lowerVal;
  const frac = idx - lower;
  return lowerVal + (upperVal - lowerVal) * frac;
}

/** Interquartile-range outlier trim. Returns the values with points outside
 * [Q1 - k*IQR, Q3 + k*IQR] removed, plus how many were dropped, so a single
 * 17-minute response time can't redefine a 30-second item's expected time
 * (spec §25, §188) while still allowing genuinely slow-but-valid attempts
 * that fall inside a wider real distribution to count. */
export function trimOutliersIQR(
  values: number[],
  k = 1.5
): { kept: number[]; droppedCount: number } {
  if (values.length < 4) return { kept: values, droppedCount: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25, true);
  const q3 = percentile(sorted, 0.75, true);
  if (q1 === null || q3 === null) return { kept: values, droppedCount: 0 };
  const iqr = q3 - q1;
  const low = q1 - k * iqr;
  const high = q3 + k * iqr;
  const kept = values.filter((v) => v >= low && v <= high);
  return { kept, droppedCount: values.length - kept.length };
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function variance(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function clamp(x: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, x));
}

/** Simple content hash (FNV-1a, 32-bit) for detecting "did the question
 * version's substantive content change" (spec §146). Not cryptographic —
 * it doesn't need to be, it only needs to be a stable, cheap fingerprint of
 * the fields that matter for difficulty (stem, options, correct answer,
 * structural metadata) so a pure punctuation edit doesn't trip a
 * recalibration and a real change to the mathematics does. */
export function contentHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
