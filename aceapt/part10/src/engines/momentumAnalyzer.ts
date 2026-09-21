import { THRESHOLDS } from '../config/thresholds';
import { TrajectoryPoint, MomentumResult } from '../types';
import { stdev } from './mathUtils';

/**
 * SS11 Mastery Momentum.
 * Looks at the *second derivative* - are consecutive gains getting
 * bigger, holding at a steady pace, uneven/shrinking, or has the trend
 * actually flipped negative?
 *
 * Per the spec's own worked examples: 60->68->77->84 (deltas 8,9,7) is
 * "positive momentum" at a roughly steady clip -> STABLE. 60->70->74->76
 * (deltas 10,4,2) is explicitly "improvement is slowing" -> SLOWING,
 * even though the deceleration is sharp, BECAUSE every interval is
 * still a net gain. REVERSING is reserved for when the latest interval
 * is an actual decline, not merely a fast slowdown - conflating those
 * two was an earlier bug here (a sharp-but-still-positive deceleration
 * was wrongly classified as REVERSING).
 */
export function analyzeMomentum(points: TrajectoryPoint[], metric: string): MomentumResult {
  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  if (sorted.length < 4) {
    return { metric, state: 'INSUFFICIENT_EVIDENCE', detail: 'Need at least 4 data points to assess momentum.' };
  }

  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) deltas.push(sorted[i].value - sorted[i - 1].value);

  const deltaOfDeltas: number[] = [];
  for (let i = 1; i < deltas.length; i++) deltaOfDeltas.push(deltas[i] - deltas[i - 1]);

  const avgChange = deltaOfDeltas.reduce((s, v) => s + v, 0) / deltaOfDeltas.length;
  const { accelerationDelta, stableDeltaStdev } = THRESHOLDS.momentum;
  const latestDelta = deltas[deltas.length - 1];
  const deltaSpread = stdev(deltas);

  let state: MomentumResult['state'];
  let detail: string;

  if (latestDelta < 0) {
    state = 'REVERSING';
    detail = 'The most recent interval shows an actual decline, not just slower improvement.';
  } else if (deltaSpread < stableDeltaStdev) {
    state = 'STABLE';
    detail = 'Gains are landing at a consistent pace interval to interval.';
  } else if (avgChange >= accelerationDelta) {
    state = 'ACCELERATING';
    detail = 'Each recent gain is landing larger than the one before it.';
  } else {
    state = 'SLOWING';
    detail = 'Gains are continuing, but at a decreasing rate.';
  }

  return { metric, state, detail };
}
