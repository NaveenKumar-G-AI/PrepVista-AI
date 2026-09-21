/**
 * Rubric Engine — deterministic weighted scoring (Phase 34, 42).
 * No AI, no network, no side effects, no dependencies. Pure function in,
 * structured result out — this is the one module every score in the
 * system ultimately runs through.
 *
 * @typedef {import('../types').Rubric} Rubric
 * @typedef {import('../types').CategoryScoreBreakdown} CategoryScoreBreakdown
 */

export class RubricValidationError extends Error {}

/**
 * @param {Rubric} rubric
 * @returns {true}
 * @throws {RubricValidationError}
 */
export function validateRubric(rubric) {
  if (!rubric || !Array.isArray(rubric.categories) || rubric.categories.length === 0) {
    throw new RubricValidationError('Rubric must define at least one category.');
  }
  const totalWeight = rubric.categories.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    throw new RubricValidationError(`Rubric weights must sum to 100 (got ${totalWeight}).`);
  }
  for (const c of rubric.categories) {
    if (!c.key || typeof c.weight !== 'number' || c.weight < 0) {
      throw new RubricValidationError(`Invalid category definition: ${JSON.stringify(c)}`);
    }
  }
  return true;
}

/**
 * Weighted scoring over only the categories that actually have a score.
 *
 * A category missing from categoryScores is NOT defaulted to 0 and is NOT
 * silently dropped either — its weight is renormalized across whatever
 * categories DO have a score, and it's listed in missingCategories so a
 * caller can surface "3 of 6 categories assessed" instead of a number that
 * looks complete but isn't. This is what lets evaluation continue when AI
 * (which is the only source for some categories) is unavailable, per
 * Phase 43, without either unfairly zeroing a student or fabricating a
 * score for something nobody actually reviewed.
 *
 * @param {Rubric} rubric
 * @param {Record<string, number>} categoryScores - key -> 0-100 raw score
 * @returns {{
 *   totalScore: number,
 *   breakdown: CategoryScoreBreakdown[],
 *   missingCategories: string[],
 *   fullyAssessed: boolean,
 * }}
 */
export function scoreSubmission(rubric, categoryScores) {
  validateRubric(rubric);

  const missingCategories = [];
  const scored = [];
  for (const cat of rubric.categories) {
    const raw = categoryScores[cat.key];
    if (raw === undefined || raw === null || Number.isNaN(raw)) {
      missingCategories.push(cat.key);
      continue;
    }
    scored.push({ ...cat, rawScore: Math.max(0, Math.min(100, raw)) });
  }

  const availableWeight = scored.reduce((sum, c) => sum + c.weight, 0);
  const breakdown = scored.map((c) => {
    const effectiveWeight = availableWeight > 0 ? (c.weight / availableWeight) * 100 : 0;
    const weightedScore = (c.rawScore * effectiveWeight) / 100;
    return {
      key: c.key,
      label: c.label,
      weight: c.weight,
      effectiveWeight: Number(effectiveWeight.toFixed(2)),
      rawScore: c.rawScore,
      weightedScore: Number(weightedScore.toFixed(2)),
    };
  });

  const totalScore = Number(breakdown.reduce((sum, b) => sum + b.weightedScore, 0).toFixed(2));

  return {
    totalScore,
    breakdown,
    missingCategories,
    fullyAssessed: missingCategories.length === 0,
  };
}
