import { SelectionObjectiveWeights, PathIntent } from '../types';

/**
 * Default selection objective weights. This is the single source of truth
 * for how much each factor matters — nothing in engine/scoring.ts hardcodes
 * a magic number outside of this file. Weights are versioned; when tuned,
 * bump the version string and persist the change via the
 * `selection_weight_versions` table (see src/db/migrations) so historical
 * selection decisions stay interpretable against the weights that produced
 * them.
 */
export const DEFAULT_WEIGHTS_V1: SelectionObjectiveWeights = {
  version: 'weights-v1',
  skillGapFit: 0.2,
  uncertaintyReduction: 0.14,
  learningValue: 0.12,
  difficultyFit: 0.14,
  roleRelevance: 0.08,
  curriculumFit: 0.08,
  prerequisiteFit: 0.03,
  transferValue: 0.08,
  retentionValue: 0.05,
  novelty: 0.03,
  estimatedTimeFit: 0.02,
  challengeQuality: 0.02,
  engagementFit: 0.01,
};
// NOTE: components above (excluding `version`) must sum to 1.0 —
// enforced by tests/weightsSum.test.ts.

/**
 * Path-intent bias: once the engine has diagnosed *why* it's selecting a
 * challenge (DIAGNOSTIC, REMEDIATION, TRANSFER, ...), that intent should
 * sharpen the ranking without discarding the base weight vector as the
 * source of truth. Each multiplier is applied to the corresponding base
 * weight and the whole vector is re-normalized back to sum to 1.0.
 */
export const INTENT_BIAS: Record<PathIntent, Partial<SelectionObjectiveWeights>> = {
  DIAGNOSTIC: { uncertaintyReduction: 2.2, difficultyFit: 1.3 },
  REMEDIATION: { skillGapFit: 1.6, difficultyFit: 1.5, novelty: 0.5 },
  REINFORCEMENT: { retentionValue: 1.8 },
  TRANSFER: { transferValue: 2.0 },
  PROGRESSION: { learningValue: 1.4, difficultyFit: 1.2 },
  RETENTION_CHECK: { retentionValue: 2.2, estimatedTimeFit: 1.5 },
  ROLE_ASSESSMENT: { roleRelevance: 2.0, curriculumFit: 1.3 },
};

type WeightKey = Exclude<keyof SelectionObjectiveWeights, 'version'>;

export function applyIntentBias(
  base: SelectionObjectiveWeights,
  intent: PathIntent
): SelectionObjectiveWeights {
  const bias = INTENT_BIAS[intent] || {};
  const keys = Object.keys(base).filter((k) => k !== 'version') as WeightKey[];

  const biasedRaw: Record<WeightKey, number> = {} as Record<WeightKey, number>;
  let sum = 0;
  for (const key of keys) {
    const mult = bias[key] ?? 1;
    const value = base[key] * mult;
    biasedRaw[key] = value;
    sum += value;
  }

  const normalized: SelectionObjectiveWeights = {
    version: `${base.version}+${intent.toLowerCase()}`,
  } as SelectionObjectiveWeights;
  for (const key of keys) {
    normalized[key] = sum > 0 ? biasedRaw[key] / sum : 0;
  }
  return normalized;
}
