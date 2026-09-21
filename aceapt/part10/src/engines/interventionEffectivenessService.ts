import { THRESHOLDS } from '../config/thresholds';
import { InterventionOutcome, InterventionResponse } from '../types';

/** SS25 Intervention Effectiveness - classifies a single before/after outcome. */
export function classifyInterventionResponse(before: number, after: number): InterventionResponse {
  const delta = after - before;
  const cfg = THRESHOLDS.intervention;
  if (delta >= cfg.highResponseDelta) return 'HIGH_RESPONSE';
  if (delta >= cfg.moderateResponseDelta) return 'MODERATE_RESPONSE';
  if (delta > 0) return 'LOW_RESPONSE';
  return 'NO_RESPONSE';
}

export interface LearningResponseProfileEntry {
  interventionType: string;
  averageDelta: number;
  sampleSize: number;
}

/**
 * SS26 Learning Response Profile.
 * Aggregates outcome history by intervention type to surface which
 * strategies tend to work for *this* student - explicitly not claiming
 * any one method is universally best, and not claiming the correlation
 * is causal, just ranking observed association.
 */
export function buildLearningResponseProfile(history: InterventionOutcome[]): LearningResponseProfileEntry[] {
  const byType = new Map<string, number[]>();
  for (const h of history) {
    const delta = h.afterValue - h.beforeValue;
    byType.set(h.interventionType, [...(byType.get(h.interventionType) ?? []), delta]);
  }
  return Array.from(byType.entries())
    .map(([interventionType, deltas]) => ({
      interventionType,
      averageDelta: Number((deltas.reduce((s, d) => s + d, 0) / deltas.length).toFixed(2)),
      sampleSize: deltas.length,
    }))
    .sort((a, b) => b.averageDelta - a.averageDelta);
}
