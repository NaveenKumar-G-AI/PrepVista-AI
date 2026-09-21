import { CompetencyDimension, COMPETENCY_DIMENSIONS, FormulaStudentState, TrainingActivityType } from '../types';
import { MIN_SAMPLES_FOR_SIGNAL } from '../state/formulaStudentStateService';

export type Trend = 'IMPROVING' | 'FLAT' | 'DECLINING';

export interface BottleneckResult {
  dimension: CompetencyDimension;
  accuracy: number;
  sampleSize: number;
  confidence: 'MEDIUM' | 'HIGH';
  trend: Trend;
  suggestedActivity: TrainingActivityType;
}

const DIMENSION_TO_ACTIVITY: Record<CompetencyDimension, TrainingActivityType> = {
  recognition: 'RECOGNIZE',
  recall: 'RECALL',
  selection: 'SELECT',
  mapping: 'MAP',
  application: 'APPLY',
  verification: 'VERIFY',
  transfer: 'TRANSFER',
  retention: 'RETAIN',
};

function trendOf(outcomes: boolean[]): Trend {
  if (outcomes.length < 6) return 'FLAT';
  const mid = Math.floor(outcomes.length / 2);
  const earlier = outcomes.slice(0, mid);
  const recent = outcomes.slice(mid);
  const earlierAcc = earlier.filter(Boolean).length / earlier.length;
  const recentAcc = recent.filter(Boolean).length / recent.length;
  if (recentAcc - earlierAcc >= 0.2) return 'IMPROVING';
  if (earlierAcc - recentAcc >= 0.2) return 'DECLINING';
  return 'FLAT';
}

/**
 * Finds the student's current formula bottleneck (spec sections 67,
 * 118-121, 180-181).
 *
 * Design choice: dimensions are checked in the recommended learning
 * progression order - recognition, recall, selection, mapping, application,
 * verification, transfer, retention (spec section 186) - and the
 * bottleneck is the EARLIEST dimension in that order that (a) has enough
 * evidence to trust and (b) is not yet strong. This mirrors the worked
 * adaptation table in spec section 67/181 directly ("Recall low -> recall
 * training"; "Recall high, Selection low -> discrimination training"; etc):
 * it deliberately does not chase whichever dimension has the single lowest
 * accuracy, because a downstream dimension (e.g. transfer) often cannot be
 * reliably measured while an upstream one (e.g. selection) is still shaky -
 * the same "first error, not every downstream symptom" principle as the
 * per-attempt classifier, applied at the profile level.
 *
 * `importanceWeights` (spec section 180: "importance to current goal")
 * tightens the bar for dimensions that matter more right now: a
 * higher-weighted dimension is flagged as the bottleneck at a higher
 * accuracy threshold, so it surfaces sooner.
 */
export function analyzeBottleneck(
  state: FormulaStudentState,
  opts: { minSamples?: number; importanceWeights?: Partial<Record<CompetencyDimension, number>> } = {},
): BottleneckResult | null {
  const minSamples = opts.minSamples ?? MIN_SAMPLES_FOR_SIGNAL;
  const weights = opts.importanceWeights ?? {};

  for (const dimension of COMPETENCY_DIMENSIONS) {
    const evidence = state.dimensions[dimension];
    if (!evidence || evidence.attempts < minSamples) continue; // not enough evidence to trust - skip, do not guess

    const outcomes = evidence.recentOutcomes;
    const accuracy = outcomes.filter(Boolean).length / outcomes.length;
    const weight = weights[dimension] ?? 1;
    const threshold = Math.min(0.9, 0.75 * weight);

    if (accuracy < threshold) {
      return {
        dimension,
        accuracy,
        sampleSize: evidence.attempts,
        confidence: evidence.attempts >= minSamples * 2 ? 'HIGH' : 'MEDIUM',
        trend: trendOf(outcomes),
        suggestedActivity: DIMENSION_TO_ACTIVITY[dimension],
      };
    }
  }

  return null;
}
