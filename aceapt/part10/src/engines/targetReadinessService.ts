import { THRESHOLDS } from '../config/thresholds';
import { TargetReadinessResult, TrajectoryState } from '../types';
import { daysBetween } from './mathUtils';

export interface TargetReadinessInputs {
  currentReadiness: number | null;
  targetScore: number;
  targetDate: string | null;
  trajectoryState: TrajectoryState;
  slopePerWeek: number | null;
  confidenceIsSufficient: boolean;
}

/**
 * SS15 Readiness Forecast, SS16 Target-Based Forecasting,
 * SS17 Time-to-Readiness.
 * Deliberately hedged: this never returns "will pass" / "will fail",
 * only a status plus the evidence behind it (SS40 No Fake Precision).
 * Falls back to INSUFFICIENT_EVIDENCE rather than guessing whenever the
 * trajectory itself is unclear or confidence is too low to trust it.
 */
export function assessTargetReadiness(inputs: TargetReadinessInputs): TargetReadinessResult {
  const { currentReadiness, targetScore, targetDate, trajectoryState, slopePerWeek, confidenceIsSufficient } = inputs;

  if (currentReadiness === null || trajectoryState === 'INSUFFICIENT_EVIDENCE' || !confidenceIsSufficient) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      currentReadiness,
      targetScore,
      gap: currentReadiness === null ? null : Number((targetScore - currentReadiness).toFixed(1)),
      daysRemaining: targetDate ? daysBetween(new Date(), new Date(targetDate)) : null,
      estimatedWeeksToTarget: null,
      message: 'Not enough evidence to reliably assess progress toward this target yet.',
    };
  }

  const gap = Number((targetScore - currentReadiness).toFixed(1));
  const daysRemaining = targetDate ? daysBetween(new Date(), new Date(targetDate)) : null;
  const buffer = THRESHOLDS.target.onTrackBufferPoints;

  let estimatedWeeksToTarget: number | null = null;
  if (slopePerWeek !== null && slopePerWeek > 0.1 && gap > 0) {
    estimatedWeeksToTarget = Number((gap / slopePerWeek).toFixed(1));
  }

  let status: TargetReadinessResult['status'];
  let message: string;

  if (gap <= buffer) {
    status = 'ON_TRACK';
    message = 'Current evidence indicates readiness is at or near the target.';
  } else if (trajectoryState === 'REGRESSING' || trajectoryState === 'UNSTABLE' || (slopePerWeek !== null && slopePerWeek <= 0)) {
    status = daysRemaining !== null && daysRemaining <= THRESHOLDS.target.atRiskWindowDays ? 'BEHIND' : 'AT_RISK';
    message =
      status === 'BEHIND'
        ? 'Current trajectory and remaining time make it unlikely the target will be reached without a change in approach.'
        : 'Current evidence indicates progress toward the target, but the current trajectory may require additional improvement.';
  } else if (estimatedWeeksToTarget !== null && daysRemaining !== null && estimatedWeeksToTarget * 7 > daysRemaining) {
    status = 'AT_RISK';
    message = 'Current evidence indicates progress toward the target, but the current pace may not be enough to arrive in time.';
  } else {
    status = 'ON_TRACK';
    message = 'Current evidence indicates progress toward the target at a pace consistent with reaching it.';
  }

  return { status, currentReadiness, targetScore, gap, daysRemaining, estimatedWeeksToTarget, message };
}
