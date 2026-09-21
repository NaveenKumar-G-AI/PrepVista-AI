import { checkComparability, type ComparabilityOptions } from "./comparability";
import { calculateConfidence } from "./confidence";
import type { GrowthResult, SkillObservation } from "./types";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The single entry point for turning a baseline + current observation into
 * a growth number. If the two observations are not meaningfully
 * comparable, this returns `{ unavailable: true, reasons }` instead of a
 * fabricated value — callers must handle that case explicitly rather than
 * defaulting to zero or hiding it.
 */
export function calculateGrowth(
  baseline: SkillObservation,
  current: SkillObservation,
  opts?: ComparabilityOptions
): GrowthResult {
  const comparability = checkComparability(baseline, current, opts);
  if (!comparability.comparable) {
    return { unavailable: true, skillId: current.skillId, reasons: comparability.reasons };
  }

  const absoluteChange = round1(current.value - baseline.value);
  const relativeChange =
    baseline.value === 0 ? null : round1((absoluteChange / baseline.value) * 1000) / 10;

  return {
    skillId: current.skillId,
    baselineValue: baseline.value,
    currentValue: current.value,
    absoluteChange,
    relativeChange,
    confidence: calculateConfidence(current),
    evidenceCount: current.evidence.length,
    firstObservedAt: baseline.observedAt,
    lastObservedAt: current.observedAt,
  };
}
