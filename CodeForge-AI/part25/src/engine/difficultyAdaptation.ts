import { DifficultyDimensions, DIFFICULTY_DIMENSION_KEYS, SkillEvidencePoint, PathIntent } from '../types';

const STEP_UP = 12;
const STEP_DOWN = 15;
const NEUTRAL_DIMENSION_DEFAULT = 40;

function averageDimensions(
  points: { dimensionsExercised: Partial<DifficultyDimensions> }[]
): DifficultyDimensions {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const key of DIFFICULTY_DIMENSION_KEYS) {
    sums[key] = 0;
    counts[key] = 0;
  }
  for (const p of points) {
    for (const key of DIFFICULTY_DIMENSION_KEYS) {
      const v = p.dimensionsExercised[key];
      if (typeof v === 'number') {
        sums[key] += v;
        counts[key] += 1;
      }
    }
  }
  const out = {} as DifficultyDimensions;
  for (const key of DIFFICULTY_DIMENSION_KEYS) {
    out[key] = counts[key] > 0 ? sums[key] / counts[key] : NEUTRAL_DIMENSION_DEFAULT;
  }
  return out;
}

/**
 * Identifies which difficulty dimension most likely caused recent
 * struggles, using the sub-scores captured on the evidence itself
 * (understanding/reasoning/debugging) instead of assuming "the whole
 * problem was too hard". Backs the spec's DIFFICULTY_DE-ESCALATION
 * bottleneck-isolation requirement.
 */
function identifyBottleneckDimension(recentFailures: SkillEvidencePoint[]): keyof DifficultyDimensions {
  const signals: Record<'reasoning' | 'debugging' | 'state', number> = {
    reasoning: 0,
    debugging: 0,
    state: 0,
  };
  let n = 0;
  for (const e of recentFailures) {
    if (e.reasoningScore !== undefined) {
      signals.reasoning += 100 - e.reasoningScore;
      n++;
    }
    if (e.debuggingScore !== undefined) {
      signals.debugging += 100 - e.debuggingScore;
      n++;
    }
    if (e.understandingScore !== undefined) {
      signals.state += 100 - e.understandingScore;
      n++;
    }
  }
  if (n === 0) return 'state'; // conservative default: state-management is the most common silent failure mode
  const [best] = (Object.entries(signals) as [keyof typeof signals, number][]).sort((a, b) => b[1] - a[1]);
  return best[0];
}

/**
 * Computes the *target* difficulty vector for the next challenge given the
 * student's recent comfort zone and the diagnosed PathIntent. This is where
 * "selective difficulty change" happens: only the dimension implicated by
 * the intent moves; everything else holds at the student's demonstrated
 * comfort zone. A single failure intentionally leaves the vector unchanged
 * (paired with the overfit guard in evidence/aggregateEvidence.ts) — only
 * 2+ consecutive failures justify isolating and reducing a dimension.
 */
export function computeTargetDifficulty(
  recentEvidence: SkillEvidencePoint[],
  intent: PathIntent,
  consecutiveFailures: number,
  consecutiveSuccessesAtHarderLevel: number
): DifficultyDimensions {
  const comfortZone = averageDimensions(recentEvidence.slice(-6));
  const target: DifficultyDimensions = { ...comfortZone };

  if (intent === 'DIAGNOSTIC') {
    // A diagnostic shouldn't itself be hard, or a failure teaches us nothing.
    for (const key of DIFFICULTY_DIMENSION_KEYS) target[key] = Math.min(target[key], 45);
    return target;
  }

  if (intent === 'REMEDIATION') {
    if (consecutiveFailures >= 2) {
      const failures = recentEvidence.filter((e) => e.outcome === 'FAILURE').slice(-3);
      const bottleneck = identifyBottleneckDimension(failures);
      target[bottleneck] = Math.max(15, target[bottleneck] - STEP_DOWN);
      // Everything else stays at the comfort zone: we keep the same
      // concept and isolate the weak dimension, rather than switching to a
      // completely different, easier algorithm.
    }
    return target;
  }

  if (intent === 'TRANSFER') {
    target.transfer = Math.min(95, target.transfer + STEP_UP);
    // Algorithm/implementation hold steady — we're testing abstraction,
    // not simultaneously raising the algorithmic bar.
    return target;
  }

  if (intent === 'PROGRESSION') {
    if (consecutiveSuccessesAtHarderLevel >= 2) {
      // Corroborated by a second success — commit fully to the higher level.
      for (const key of DIFFICULTY_DIMENSION_KEYS) target[key] = Math.min(95, target[key] + STEP_UP);
    } else {
      // A single success only moves the target partway (overfit guard) —
      // full commitment waits for corroboration.
      for (const key of DIFFICULTY_DIMENSION_KEYS) target[key] = Math.min(95, target[key] + STEP_UP * 0.5);
    }
    return target;
  }

  if (intent === 'REINFORCEMENT' || intent === 'RETENTION_CHECK') {
    // Compact, at/slightly below the mastered comfort zone.
    for (const key of DIFFICULTY_DIMENSION_KEYS) target[key] = Math.max(20, target[key] - 5);
    return target;
  }

  // ROLE_ASSESSMENT: reflect the demonstrated comfort zone as-is; role
  // relevance is handled as a separate scoring term, not a difficulty shift.
  return target;
}

export function difficultyDistance(a: DifficultyDimensions, b: DifficultyDimensions): number {
  let sumSq = 0;
  for (const key of DIFFICULTY_DIMENSION_KEYS) {
    const d = a[key] - b[key];
    sumSq += d * d;
  }
  return Math.sqrt(sumSq);
}
