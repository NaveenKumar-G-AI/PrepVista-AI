import { AlignmentExplanationFacts, AlignmentResult, CapabilityDna, ForecastSignal, TargetProfile } from '../domain/types';
import { evaluateRequirements } from './requirementEvaluator';
import { classifyGaps } from './gapClassifier';
import { calculateFit } from './fitCalculator';
import { calculateReadiness } from './readinessCalculator';
import { aggregateConfidence } from './overallConfidence';
import { classifyAlignmentState } from './alignmentStateClassifier';
import { prioritizeNextBestAction } from './gapPrioritizer';

const TOP_STRENGTHS_FOR_EXPLANATION = 3;
const TOP_GAPS_FOR_EXPLANATION = 3;

/**
 * The single deterministic pipeline (spec §18, §75 P0):
 *
 *   dna, target  --> evaluateRequirements   (one row per requirement)
 *                --> classifyGaps           (strengths / critical / supporting / missing)
 *                --> calculateFit           (spec §16-19)
 *                --> calculateReadiness     (spec §16, §7-8)
 *                --> aggregateConfidence    (spec §12, §20)
 *                --> classifyAlignmentState (spec §21) — decides whether the
 *                                              scores above are even shown
 *                --> prioritizeNextBestAction (spec §26-27)
 *
 * Same inputs always produce the same output — no AI call sits anywhere in
 * this file (spec §18, §48).
 */
export function calculateAlignment(
  dna: CapabilityDna,
  target: TargetProfile,
  forecastSignals: ForecastSignal[] = [],
  now: Date = new Date(),
): AlignmentResult {
  const evaluations = evaluateRequirements(dna, target);
  const { strengths, criticalGaps, supportingGaps, insufficientEvidenceCapabilityIds } =
    classifyGaps(evaluations);

  const fit = calculateFit(evaluations);
  const readiness = calculateReadiness(evaluations, forecastSignals);
  const confidence = aggregateConfidence(evaluations);
  const { state, insufficientEvidenceReason } = classifyAlignmentState(
    evaluations,
    fit.fitScore,
    readiness.readinessScore,
    fit.criticalGapCount,
  );

  const isInsufficient = state === 'INSUFFICIENT_EVIDENCE';
  const nextBestAction = isInsufficient
    ? null
    : prioritizeNextBestAction(criticalGaps, supportingGaps);

  const explanationFacts: AlignmentExplanationFacts = {
    targetName: target.name,
    state,
    fitScore: isInsufficient ? null : fit.fitScore,
    readinessScore: isInsufficient ? null : readiness.readinessScore,
    confidence: confidence.band,
    topStrengths: strengths.slice(0, TOP_STRENGTHS_FOR_EXPLANATION).map((s) => s.capabilityName),
    criticalGapNames: criticalGaps.slice(0, TOP_GAPS_FOR_EXPLANATION).map((g) => g.capabilityName),
    supportingGapNames: supportingGaps.slice(0, TOP_GAPS_FOR_EXPLANATION).map((g) => g.capabilityName),
    nextBestActionCapability: nextBestAction?.capabilityName ?? null,
  };

  return {
    studentId: dna.studentId,
    targetId: target.targetId,
    targetName: target.name,
    calculatedAt: now.toISOString(),
    state,
    fitScore: isInsufficient ? null : fit.fitScore,
    readinessScore: isInsufficient ? null : readiness.readinessScore,
    confidence: confidence.band,
    strengths,
    criticalGaps,
    supportingGaps,
    nextBestAction,
    insufficientEvidenceCapabilities: insufficientEvidenceCapabilityIds,
    insufficientEvidenceReason,
    explanationFacts: isInsufficient
      ? { ...explanationFacts, targetName: target.name }
      : explanationFacts,
  };
}

/** Convenience for computing every active target at once (the ALIGN dashboard's main call). */
export function calculateAlignmentForAllTargets(
  dna: CapabilityDna,
  targets: TargetProfile[],
  forecastSignals: ForecastSignal[] = [],
  now: Date = new Date(),
): AlignmentResult[] {
  return targets.filter((t) => t.active).map((t) => calculateAlignment(dna, t, forecastSignals, now));
}
