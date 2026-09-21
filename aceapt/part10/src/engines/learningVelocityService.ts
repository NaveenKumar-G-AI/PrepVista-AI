import { TrajectoryPoint } from '../types';
import { linearRegressionSlope } from './mathUtils';

export type VelocityBand = 'MINIMAL' | 'MODERATE' | 'STRONG' | 'RAPID' | 'INSUFFICIENT_EVIDENCE';

export interface LearningVelocityResult {
  metric: string;
  pointsPerWeek: number | null;
  band: VelocityBand;
}

/**
 * SS10 Learning Velocity.
 * Distinct from TrajectoryService: trajectory classifies *shape*
 * (direction, whether it's slowing), velocity classifies *magnitude*
 * (how fast, regardless of direction) - "60->65->72->81" and
 * "60->62->64->65" can both be UPWARD, but they are not the same speed.
 */
export function computeLearningVelocity(points: TrajectoryPoint[], metric: string): LearningVelocityResult {
  if (points.length < 2) {
    return { metric, pointsPerWeek: null, band: 'INSUFFICIENT_EVIDENCE' };
  }
  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const slope = linearRegressionSlope(sorted.map((p) => ({ timestamp: p.timestamp, value: p.value })));
  if (slope === null) return { metric, pointsPerWeek: null, band: 'INSUFFICIENT_EVIDENCE' };

  const magnitude = Math.abs(slope);
  let band: VelocityBand;
  if (magnitude < 1) band = 'MINIMAL';
  else if (magnitude < 3) band = 'MODERATE';
  else if (magnitude < 6) band = 'STRONG';
  else band = 'RAPID';

  return { metric, pointsPerWeek: Number(slope.toFixed(3)), band };
}
