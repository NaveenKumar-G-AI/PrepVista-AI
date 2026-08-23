/**
 * PrepVista AI — Part 15
 * Minimal, dependency-free statistics helpers. Kept intentionally small and
 * auditable rather than pulling in a stats package — every function here is
 * used by exactly one caller and is unit-testable in isolation.
 */

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

export function meanAbsoluteError(errors: number[]): number {
  if (errors.length === 0) return NaN;
  return mean(errors.map((e) => Math.abs(e)));
}

/**
 * Empirical-Bayes-style shrinkage: blends an observed rate toward a prior
 * (e.g. historical/institutional) rate, weighted by how much data backs the
 * observed rate. Small samples shrink hard toward the prior; large samples
 * barely move. This is the principled version of a small-sample safeguard —
 * rather than a hard cutoff, uncertain estimates are pulled toward a more
 * reliable reference instead of being trusted at face value.
 *
 * @param observedRate  rate computed from `sampleSize` observations
 * @param sampleSize    number of observations backing observedRate
 * @param priorRate     reference rate to shrink toward
 * @param priorWeight   "pseudo-count" strength of the prior; higher = more shrinkage
 */
export function shrinkTowardPrior(observedRate: number, sampleSize: number, priorRate: number, priorWeight: number): number {
  if (sampleSize < 0 || priorWeight < 0) throw new Error("sampleSize and priorWeight must be non-negative");
  const denom = sampleSize + priorWeight;
  if (denom === 0) return priorRate;
  return (sampleSize * observedRate + priorWeight * priorRate) / denom;
}

/** Round to 1 decimal place — used for display-facing percentages. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Round to 2 decimal places — used for score components (impact, urgency,
 * feasibility, confidence, priorityScore) that are typically small (0-1
 * range, often products of several such factors). PART15_HOSTILE_REVIEW.md
 * finding F5: round1 was rounding real, distinguishing differences between
 * recommendations down to a displayed "0", which is honest math but useless
 * for a TPO trying to tell candidates apart. Two decimals restores enough
 * resolution without implying false precision.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}
