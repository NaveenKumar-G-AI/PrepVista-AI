import { THRESHOLDS } from '../config/thresholds';
import { TrajectoryPoint, SkillTrajectoryResult } from '../types';
import { linearRegressionSlope, splitHalfSlopes } from './mathUtils';
import { classifyTrendVolatility } from './volatilityService';

/**
 * SS9 Mastery Trajectory.
 * Classifies the shape of a metric's history into exactly one of:
 * UPWARD | STABLE | SLOWING | REGRESSING | UNSTABLE | INSUFFICIENT_EVIDENCE
 *
 * Deterministic - no LLM involved (SS35 Deterministic Core). High
 * variance overrides a slope-based read: a trend line through noisy
 * data is more misleading than admitting the data is unstable.
 */
export function classifyTrajectory(points: TrajectoryPoint[], metric: string): SkillTrajectoryResult {
  const t = THRESHOLDS.trajectory;

  if (points.length < t.minPointsForTrend) {
    return {
      metric,
      state: 'INSUFFICIENT_EVIDENCE',
      slopePerWeek: null,
      volatility: 'INSUFFICIENT_EVIDENCE',
      pointsUsed: points.length,
      window: points.length
        ? { start: points[0].timestamp, end: points[points.length - 1].timestamp }
        : null,
    };
  }

  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const seriesInput = sorted.map((p) => ({ timestamp: p.timestamp, value: p.value }));
  const volatility = classifyTrendVolatility(seriesInput);
  const slope = linearRegressionSlope(seriesInput);

  let state: SkillTrajectoryResult['state'];

  if (volatility === 'HIGHLY_VARIABLE') {
    state = 'UNSTABLE';
  } else if (slope === null) {
    state = 'INSUFFICIENT_EVIDENCE';
  } else if (Math.abs(slope) <= t.stableBand) {
    state = 'STABLE';
  } else if (slope <= t.regressingSlopePerWeek) {
    state = 'REGRESSING';
  } else if (slope > t.stableBand) {
    const { first, second } = splitHalfSlopes(seriesInput);
    if (first !== null && second !== null && first > 0 && second < first * t.slowingRatio) {
      state = 'SLOWING';
    } else {
      state = 'UPWARD';
    }
  } else {
    // Negative but milder than the regressing cutoff, outside the stable band.
    state = 'REGRESSING';
  }

  return {
    metric,
    state,
    slopePerWeek: slope === null ? null : Number(slope.toFixed(3)),
    volatility,
    pointsUsed: sorted.length,
    window: { start: sorted[0].timestamp, end: sorted[sorted.length - 1].timestamp },
  };
}
