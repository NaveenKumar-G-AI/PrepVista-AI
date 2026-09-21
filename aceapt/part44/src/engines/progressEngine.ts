// Outcome-based progress (Section 26) - never questions_completed /
// total_questions. Progress is how far the student has actually closed
// the gap versus their baseline, per dimension, weighted by how much the
// goal cares about that dimension.
import type { CapabilityDimension } from "../domain/types.js";

export interface ProgressEngineInput {
  baseline: Partial<Record<CapabilityDimension, number>>;
  latest: Partial<Record<CapabilityDimension, number>>;
  target: Partial<Record<CapabilityDimension, number>>;
  /** Relative importance per dimension, e.g. from the priority engine's
   * goalRelevance. Dimensions without a weight default to 1. */
  weights?: Partial<Record<CapabilityDimension, number>>;
}

export interface DimensionProgress {
  dimension: CapabilityDimension;
  baseline: number;
  latest: number;
  target: number;
  change: number;
  progressPct: number; // 0-100, how much of the baseline-to-target gap is closed
}

export interface ProgressResult {
  overall: number; // 0-100, weighted average across computable dimensions
  perDimension: DimensionProgress[];
  confidence: "LOW" | "MODERATE" | "HIGH";
}

export function computeProgress(input: ProgressEngineInput): ProgressResult {
  const dims = Object.keys(input.target) as CapabilityDimension[];
  const perDimension: DimensionProgress[] = [];

  for (const dim of dims) {
    const baseline = input.baseline[dim];
    const latest = input.latest[dim];
    const target = input.target[dim];
    if (baseline === undefined || latest === undefined || target === undefined) continue; // never guess a missing point

    const change = round2(latest - baseline);
    let progressPct: number;
    if (target <= baseline) {
      // Section 34: target was already met at (or before) baseline.
      progressPct = latest >= target ? 100 : clamp((latest / target) * 100, 0, 100);
    } else {
      progressPct = clamp(((latest - baseline) / (target - baseline)) * 100, 0, 100);
    }

    perDimension.push({ dimension: dim, baseline, latest, target, change, progressPct: round2(progressPct) });
  }

  if (perDimension.length === 0) {
    return { overall: 0, perDimension: [], confidence: "LOW" };
  }

  const totalWeight = perDimension.reduce(
    (sum, d) => sum + (input.weights?.[d.dimension] ?? 1),
    0
  );
  const overall = round2(
    perDimension.reduce(
      (sum, d) => sum + d.progressPct * (input.weights?.[d.dimension] ?? 1),
      0
    ) / totalWeight
  );

  const confidence = perDimension.length >= 3 ? "HIGH" : perDimension.length === 2 ? "MODERATE" : "LOW";

  return { overall, perDimension, confidence };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
