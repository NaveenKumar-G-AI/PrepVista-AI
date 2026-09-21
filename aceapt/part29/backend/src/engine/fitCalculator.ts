import { ImportanceTier } from '../domain/types';
import { RequirementEvaluation } from './requirementEvaluator';

/**
 * FIT: does this student's demonstrated capability profile match what this
 * target actually requires? Distinct from READINESS (readinessCalculator.ts)
 * — see spec §16. This function is pure arithmetic over already-evaluated
 * requirements; it never calls an LLM and never sees a raw student record,
 * so the same evaluations always produce the same fit score (spec §18).
 */

const IMPORTANCE_WEIGHT: Record<ImportanceTier, number> = {
  CORE: 1.0,
  IMPORTANT: 0.6,
  SUPPORTING: 0.3,
};

/** Confidence discounts a requirement's contribution but never zeroes it out. */
const CONFIDENCE_MULTIPLIER = { LOW: 0.7, MEDIUM: 0.9, HIGH: 1.0 } as const;

/**
 * With N critical gaps present, fit is capped at this ceiling regardless of
 * how strong every other requirement is. One critical gap already caps
 * comfortably below "strongly aligned"; each additional one lowers the
 * ceiling further, floored so the number stays meaningful rather than
 * collapsing to zero.
 */
function criticalGapCeiling(criticalGapCount: number): number {
  if (criticalGapCount <= 0) return 1;
  return Math.max(0.25, 0.55 - 0.08 * (criticalGapCount - 1));
}

export interface FitCalculation {
  fitScore: number; // 0..100
  rawFitBeforeCap: number; // 0..100, for transparency/testing
  wasCapped: boolean;
  criticalGapCount: number;
}

export function calculateFit(evaluations: RequirementEvaluation[]): FitCalculation {
  if (evaluations.length === 0) {
    return { fitScore: 0, rawFitBeforeCap: 0, wasCapped: false, criticalGapCount: 0 };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  let criticalGapCount = 0;

  for (const r of evaluations) {
    const importanceWeight = IMPORTANCE_WEIGHT[r.importance];
    const confidenceMultiplier = r.hasEvidence ? CONFIDENCE_MULTIPLIER[r.confidenceBand] : 1;
    weightedSum += r.achievementRatio * confidenceMultiplier * importanceWeight;
    weightTotal += importanceWeight;
    if (r.isCriticalGap) criticalGapCount += 1;
  }

  const rawFit = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const ceiling = criticalGapCeiling(criticalGapCount);
  const cappedFit = Math.min(rawFit, ceiling);

  return {
    fitScore: Math.round(Math.max(0, Math.min(1, cappedFit)) * 100),
    rawFitBeforeCap: Math.round(Math.max(0, Math.min(1, rawFit)) * 100),
    wasCapped: cappedFit < rawFit - 1e-9,
    criticalGapCount,
  };
}
