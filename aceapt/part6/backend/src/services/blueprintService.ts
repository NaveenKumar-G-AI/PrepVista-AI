import { getBlueprint } from '../config/blueprints';
import { AssessmentBlueprint, AssessmentType, Topic, TopicWeight } from '../domain/types';

const ROUNDING_TOLERANCE = 0.5;

/** Sanity-checks a blueprint's percentages actually sum to what they claim to (guards against config typos). */
export function validateBlueprint(bp: AssessmentBlueprint): void {
  const topicSum = bp.topicWeights.reduce((s, w) => s + w.weightPct, 0);
  if (Math.abs(topicSum - 100) > ROUNDING_TOLERANCE) {
    throw new Error(`Blueprint ${bp.id}: topic weights sum to ${topicSum}, expected ~100`);
  }
  const diffSum = Object.values(bp.difficultyDistribution).reduce((s, v) => s + v, 0);
  if (Math.abs(diffSum - 1) > 0.01) {
    throw new Error(`Blueprint ${bp.id}: difficulty distribution sums to ${diffSum}, expected 1.0`);
  }
  if (bp.questionCount <= 0 || bp.durationSeconds <= 0) {
    throw new Error(`Blueprint ${bp.id}: questionCount and durationSeconds must be positive`);
  }
}

/**
 * Redistributes topic weight toward a set of focus topics (section 3's
 * "Assessment Objective" made concrete). Focus topics collectively receive
 * `focusSharePct`, split evenly among themselves; the remainder is spread
 * across the other topics in proportion to their original weights.
 */
export function applyFocusOverride(
  baseWeights: TopicWeight[],
  focusTopics: Topic[],
  focusSharePct: number
): TopicWeight[] {
  if (focusTopics.length === 0) return baseWeights;

  const focusSet = new Set(focusTopics);
  const focused = baseWeights.filter((w) => focusSet.has(w.topic));
  const rest = baseWeights.filter((w) => !focusSet.has(w.topic));

  if (focused.length === 0 || rest.length === 0) return baseWeights; // nothing sensible to redistribute

  const perFocusTopic = focusSharePct / focused.length;
  const restOriginalTotal = rest.reduce((s, w) => s + w.weightPct, 0) || 1;
  const remainderPct = 100 - focusSharePct;

  const newFocused = focused.map((w) => ({ ...w, weightPct: round1(perFocusTopic) }));
  const newRest = rest.map((w) => ({
    ...w,
    weightPct: round1((w.weightPct / restOriginalTotal) * remainderPct),
  }));

  // Reconcile rounding drift onto the largest bucket so the total is exactly 100.
  const combined = [...newFocused, ...newRest];
  const drift = 100 - combined.reduce((s, w) => s + w.weightPct, 0);
  if (Math.abs(drift) > 0.001) {
    const largest = combined.reduce((a, b) => (b.weightPct > a.weightPct ? b : a));
    largest.weightPct = round1(largest.weightPct + drift);
  }
  return combined;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface ResolveBlueprintOptions {
  focusTopics?: Topic[];
}

/**
 * Resolves the concrete blueprint to use for a new assessment. PROGRESS_ and
 * MASTERY_ASSESSMENT skew toward focusTopics when provided (section 33's
 * "resume where mastery path left off" idea) - all other types ignore
 * focusTopics entirely, since a mixed/full-mock/readiness exam should stay
 * broad by design (section 7: "do not make every assessment behave
 * identically").
 */
export function resolveBlueprint(type: AssessmentType, options: ResolveBlueprintOptions = {}): AssessmentBlueprint {
  const base = getBlueprint(type);
  validateBlueprint(base);

  const focusable = type === 'PROGRESS_ASSESSMENT' || type === 'MASTERY_ASSESSMENT';
  const focusTopics = options.focusTopics ?? (focusable ? base.focusTopics : undefined);

  if (!focusable || !focusTopics || focusTopics.length === 0) {
    return base;
  }

  const focusSharePct = type === 'MASTERY_ASSESSMENT' ? 80 : 60;
  const topicWeights = applyFocusOverride(base.topicWeights, focusTopics, focusSharePct);

  return { ...base, topicWeights, focusTopics };
}
