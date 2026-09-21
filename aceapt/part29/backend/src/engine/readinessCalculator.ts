import { ForecastSignal, ImportanceTier } from '../domain/types';
import { RequirementEvaluation } from './requirementEvaluator';

/**
 * READINESS: has the student actually demonstrated, verified capability at
 * the level this target requires — right now — as opposed to FIT, which
 * asks whether their broader profile matches (spec §16). Unverified
 * evidence still counts for fit; it counts far less here, which is exactly
 * what produces the spec's own example (Fit 91%, Readiness 67%).
 *
 * Forecast (Feature 27) may nudge this slightly, but per spec §8 a
 * prediction is never proof — its maximum influence is capped small and a
 * missing/low-confidence forecast is a no-op, never a penalty.
 */

const IMPORTANCE_WEIGHT: Record<ImportanceTier, number> = {
  CORE: 1.0,
  IMPORTANT: 0.6,
  SUPPORTING: 0.3,
};

/** Unverified-but-present evidence still counts for readiness, just at a discount. */
const UNVERIFIED_DISCOUNT = 0.45;

const MAX_FORECAST_ADJUSTMENT = 0.05; // absolute, on a 0..1 scale

function criticalGapCeiling(criticalGapCount: number): number {
  if (criticalGapCount <= 0) return 1;
  // Readiness is at least as sensitive to a critical gap as fit — you
  // cannot be "ready" for a role while failing one of its core bars.
  return Math.max(0.2, 0.5 - 0.08 * (criticalGapCount - 1));
}

export interface ReadinessCalculation {
  readinessScore: number; // 0..100
  wasCapped: boolean;
  forecastAdjustment: number; // -0.05..0.05, applied on the 0..1 scale, for transparency
}

export function calculateReadiness(
  evaluations: RequirementEvaluation[],
  forecastSignals: ForecastSignal[] = [],
): ReadinessCalculation {
  if (evaluations.length === 0) {
    return { readinessScore: 0, wasCapped: false, forecastAdjustment: 0 };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  let criticalGapCount = 0;

  const forecastByCapability = new Map(forecastSignals.map((f) => [f.capabilityId, f]));

  for (const r of evaluations) {
    const importanceWeight = IMPORTANCE_WEIGHT[r.importance];
    const verifiedContribution = r.hasVerifiedEvidence
      ? r.achievementRatio
      : r.achievementRatio * UNVERIFIED_DISCOUNT;

    weightedSum += verifiedContribution * importanceWeight;
    weightTotal += importanceWeight;
    if (r.isCriticalGap) criticalGapCount += 1;
  }

  const rawReadiness = weightTotal > 0 ? weightedSum / weightTotal : 0;

  // Forecast nudge: average trend across requirements, damped by the
  // forecast engine's own confidence, then hard-capped to a small band.
  let forecastAdjustment = 0;
  if (forecastSignals.length > 0) {
    const relevant = evaluations
      .map((r) => forecastByCapability.get(r.capabilityId))
      .filter((f): f is ForecastSignal => Boolean(f));
    if (relevant.length > 0) {
      const avgTrend =
        relevant.reduce((sum, f) => sum + f.trend * f.forecastConfidence, 0) / relevant.length;
      forecastAdjustment = Math.max(
        -MAX_FORECAST_ADJUSTMENT,
        Math.min(MAX_FORECAST_ADJUSTMENT, avgTrend * MAX_FORECAST_ADJUSTMENT),
      );
    }
  }

  const adjusted = rawReadiness + forecastAdjustment;
  const ceiling = criticalGapCeiling(criticalGapCount);
  const cappedReadiness = Math.min(adjusted, ceiling);

  return {
    readinessScore: Math.round(Math.max(0, Math.min(1, cappedReadiness)) * 100),
    wasCapped: cappedReadiness < adjusted - 1e-9,
    forecastAdjustment,
  };
}
