import {
  InterventionExecution,
  InterventionOutcome,
  EffectivenessLabel,
  RetentionSignal,
  TransferSignal
} from '../domain/types';
import { OUTCOME_THRESHOLDS } from '../config';

export function classifyEffectiveness(deltaPct: number | null): EffectivenessLabel {
  if (deltaPct === null) return 'INSUFFICIENT_DATA';
  if (deltaPct >= OUTCOME_THRESHOLDS.successfulDeltaPct) return 'SUCCESSFUL';
  if (deltaPct >= OUTCOME_THRESHOLDS.partiallyEffectiveDeltaPct) return 'PARTIALLY_EFFECTIVE';
  if (deltaPct <= OUTCOME_THRESHOLDS.negativeDeltaPct) return 'NEGATIVE_RESPONSE';
  return 'NO_MEASURABLE_CHANGE';
}

/**
 * `beforeAccuracyPct` should come from the DetectedProblem's own
 * baselineAccuracyPct (the specific weak measurement that triggered the
 * intervention) — never a generic topic-wide average — so before/after stays
 * traceable to the evidence that justified the intervention in the first place.
 */
export function computeImmediateOutcome(
  execution: InterventionExecution,
  beforeAccuracyPct: number | null
): InterventionOutcome {
  const immediate = execution.result?.accuracyPct ?? null;
  const delta = beforeAccuracyPct !== null && immediate !== null ? immediate - beforeAccuracyPct : null;

  return {
    interventionId: execution.id,
    studentId: execution.studentId,
    beforeAccuracyPct: beforeAccuracyPct ?? undefined,
    immediateAccuracyPct: immediate ?? undefined,
    immediateEffectiveness: classifyEffectiveness(delta),
    evaluatedAt: new Date().toISOString()
  };
}

export function applyRetentionCheck(outcome: InterventionOutcome, signal: RetentionSignal): InterventionOutcome {
  const baseline = outcome.beforeAccuracyPct ?? null;
  const delta = baseline !== null ? signal.accuracyPct - baseline : null;
  return {
    ...outcome,
    retentionAccuracyPct: signal.accuracyPct,
    retentionMeasuredAt: signal.measuredAt,
    retentionEffectiveness: classifyEffectiveness(delta),
    evaluatedAt: new Date().toISOString()
  };
}

export function applyTransferCheck(outcome: InterventionOutcome, signal: TransferSignal): InterventionOutcome {
  // Transfer reads differently from a plain before/after delta: the goal is
  // for novel-format accuracy to CLOSE THE GAP to familiar-format accuracy,
  // not to exceed some fixed target. gapClosedPct is positive when novel is
  // close to (or above) familiar, negative when a gap remains.
  const remainingGap = signal.familiarAccuracyPct - signal.novelAccuracyPct;
  const gapClosedPct = -remainingGap;
  return {
    ...outcome,
    transferFamiliarPct: signal.familiarAccuracyPct,
    transferNovelPct: signal.novelAccuracyPct,
    transferMeasuredAt: signal.measuredAt,
    transferEffectiveness: classifyEffectiveness(gapClosedPct),
    evaluatedAt: new Date().toISOString()
  };
}
