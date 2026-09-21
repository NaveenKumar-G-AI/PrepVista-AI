import { getReadinessHistory } from './historyService';

export type ConsistencyLabel = 'STABLE' | 'HIGH_VARIANCE' | 'IMPROVING' | 'DECLINING' | 'INSUFFICIENT_DATA';

export interface ConsistencyResult {
  scored: boolean;
  score: number | null; // 0-100, null if unscored
  label: ConsistencyLabel;
  recentScores: number[]; // oldest -> newest, including the current one
  explanation: string;
}

const WINDOW = 5;
const MIN_POINTS_TO_SCORE = 2;

/**
 * Section 29: "One good assessment is insufficient evidence." Looks at up to
 * the last WINDOW readiness scores (including the one just computed for the
 * CURRENT assessment, passed in explicitly since it may not be persisted
 * yet) and scores stability, not just the average.
 */
export function computeConsistency(studentId: string, currentOverallScore: number): ConsistencyResult {
  const priorHistory = getReadinessHistory(studentId, 100);
  const priorScores = priorHistory.map((h) => h.overallScore);
  const allScores = [...priorScores, currentOverallScore].slice(-WINDOW);

  if (allScores.length < MIN_POINTS_TO_SCORE) {
    return {
      scored: false,
      score: null,
      label: 'INSUFFICIENT_DATA',
      recentScores: allScores,
      explanation: 'Only one assessment on record - consistency cannot be measured yet. Complete another assessment to start building this signal.',
    };
  }

  const mean = allScores.reduce((s, v) => s + v, 0) / allScores.length;
  const variance = allScores.reduce((s, v) => s + (v - mean) ** 2, 0) / allScores.length;
  const stdev = Math.sqrt(variance);

  // stdev of ~2-3 points -> ~95+ (very stable); ~15+ -> ~50 and below (high variance).
  const score = Math.max(0, Math.min(100, Math.round(100 - stdev * 3)));

  const half = Math.floor(allScores.length / 2);
  const firstHalfAvg = allScores.slice(0, half || 1).reduce((s, v) => s + v, 0) / (half || 1);
  const secondHalfAvg = allScores.slice(-half || allScores.length).reduce((s, v) => s + v, 0) / (half || 1);
  const trendDelta = secondHalfAvg - firstHalfAvg;

  let label: ConsistencyLabel;
  if (stdev >= 12) label = 'HIGH_VARIANCE';
  else if (trendDelta >= 6) label = 'IMPROVING';
  else if (trendDelta <= -6) label = 'DECLINING';
  else label = 'STABLE';

  const explanation =
    label === 'HIGH_VARIANCE'
      ? `Readiness has swung noticeably across the last ${allScores.length} assessments (${allScores.join(' -> ')}) - treat any single score with caution until this settles.`
      : label === 'IMPROVING'
        ? `Readiness has trended upward across the last ${allScores.length} assessments (${allScores.join(' -> ')}).`
        : label === 'DECLINING'
          ? `Readiness has trended downward across the last ${allScores.length} assessments (${allScores.join(' -> ')}) - worth a closer look.`
          : `Readiness has stayed fairly stable across the last ${allScores.length} assessments (${allScores.join(' -> ')}).`;

  return { scored: true, score, label, recentScores: allScores, explanation };
}
