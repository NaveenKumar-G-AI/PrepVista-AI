export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Maps a time-ratio (spent / expected) to a 0-100 score. 1.0 (on-budget) or
 * faster scores 100; every 10% over budget costs points, floored at 10 so a
 * single dimension is never literally zero from timing alone. */
export function scoreFromTimeRatio(ratio: number): number {
  if (ratio <= 1) return 100;
  const overBy = ratio - 1;
  return clamp(100 - overBy * 150, 10, 100);
}

/** Maps a point-gap (e.g. accuracy drop between two conditions) to a 0-100
 * score. 0-point gap scores 100; larger gaps cost points at 2x. */
export function scoreFromGapPoints(gapPoints: number): number {
  return clamp(100 - gapPoints * 2);
}

export type ConfidenceMultiplierInput = "LOW" | "MEDIUM" | "HIGH";
export function confidenceWeightMultiplier(level: ConfidenceMultiplierInput): number {
  return level === "HIGH" ? 1 : level === "MEDIUM" ? 0.7 : 0.4;
}
