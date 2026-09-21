import { masteryRank, READINESS_BANDS, READINESS_GATES } from '../config';
import type { DimensionScore, MasteryState, ReadinessResult, RoleCompetency } from '../domain/types';

/**
 * Groups role competencies by their skill category into readiness
 * dimensions (Programming, Data Structures, Algorithms, ...), scores each as
 * a weight-adjusted ratio of current-rank / target-rank, then applies a
 * configurable *gate* (Phase 26) on top of the composite score.
 *
 * The gate is what stops a smooth-looking average from producing a false
 * "READY": even a 0.9 composite is capped below READY if recent
 * verification is missing or overall evidence confidence is thin.
 */
export function computeReadiness(
  competencies: RoleCompetency[],
  masteryStates: Map<string, MasteryState>,
  skillCategory: Map<string, string>,
  targetState: string,
  recentVerificationPassed: boolean
): ReadinessResult {
  const byDimension = new Map<string, { scoreSum: number; weightSum: number }>();

  for (const c of competencies) {
    const category = skillCategory.get(c.skillId) ?? 'General';
    const state = masteryStates.get(c.skillId);
    const targetRank = masteryRank(c.targetMastery) as number;
    const currentRank = state?.masteryLevel ? (masteryRank(state.masteryLevel) as number) : 0;
    // Evidence-thin high ranks are down-weighted slightly so a single lucky
    // success can't inflate a dimension.
    const confidenceFactor = state && state.evidenceCount > 0 ? Math.max(0.5, state.confidence) : 0;
    const ratio = Math.min(1, (currentRank / Math.max(1, targetRank)) * (state ? confidenceFactor : 0));
    const w = c.weight * (c.required ? 1 : 0.5);

    const bucket = byDimension.get(category) ?? { scoreSum: 0, weightSum: 0 };
    bucket.scoreSum += ratio * w;
    bucket.weightSum += w;
    byDimension.set(category, bucket);
  }

  const dimensionScores: DimensionScore[] = Array.from(byDimension.entries()).map(([dimension, b]) => ({
    dimension,
    score: b.weightSum > 0 ? Math.round((b.scoreSum / b.weightSum) * 1000) / 1000 : 0,
    weight: b.weightSum,
  }));

  const totalWeight = dimensionScores.reduce((s, d) => s + d.weight, 0);
  const overallScore =
    totalWeight > 0
      ? Math.round((dimensionScores.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight) * 1000) / 1000
      : 0;

  const overallConfidence = computeOverallConfidence(masteryStates);

  const gate = READINESS_GATES[targetState];
  const gateUnmetReasons: string[] = [];
  let gatePassed = true;
  if (gate) {
    const weakDimensions = dimensionScores.filter((d) => d.score < gate.requiredDimensionMin);
    if (weakDimensions.length > 0) {
      gatePassed = false;
      gateUnmetReasons.push(
        `${weakDimensions.length} dimension(s) below ${gate.requiredDimensionMin}: ${weakDimensions.map((d) => d.dimension).join(', ')}`
      );
    }
    if (gate.requireRecentVerification && !recentVerificationPassed) {
      gatePassed = false;
      gateUnmetReasons.push('no recent verification-source evidence with an independent pass');
    }
    if (overallConfidence < gate.minOverallConfidence) {
      gatePassed = false;
      gateUnmetReasons.push(`overall evidence confidence ${overallConfidence.toFixed(2)} below required ${gate.minOverallConfidence}`);
    }
  }

  let state = bandForScore(overallScore);
  // The gate can only pull a state DOWN, never up — it prevents a hollow
  // "READY" claim, it never manufactures one.
  if (!gatePassed && (state === 'READY' || state === 'STRONG')) {
    state = 'APPROACHING_READY';
  }

  return { dimensionScores, overallScore, state, gatePassed, gateUnmetReasons };
}

function bandForScore(score: number) {
  for (const band of READINESS_BANDS) {
    if (score <= band.max) return band.state;
  }
  return READINESS_BANDS[READINESS_BANDS.length - 1].state;
}

function computeOverallConfidence(masteryStates: Map<string, MasteryState>): number {
  const withEvidence = Array.from(masteryStates.values()).filter((s) => s.evidenceCount > 0);
  if (withEvidence.length === 0) return 0;
  return withEvidence.reduce((s, m) => s + m.confidence, 0) / withEvidence.length;
}
