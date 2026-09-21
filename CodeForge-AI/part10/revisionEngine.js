/**
 * Revision Engine (Phase 37/38) — tracks the attempt -> evaluation ->
 * feedback -> revision -> resubmission -> re-evaluation loop, and turns
 * two evaluations into improvement evidence.
 *
 * @typedef {import('../types').EvaluationResult} EvaluationResult
 * @typedef {import('../types').RevisionRecord} RevisionRecord
 * @typedef {import('../types').ImprovementDelta} ImprovementDelta
 */

/**
 * @param {{ sessionId: string, fromSubmissionId: string, toSubmissionId: string, addressedFeedbackIds: string[] }} args
 * @returns {RevisionRecord}
 */
export function recordRevision({ sessionId, fromSubmissionId, toSubmissionId, addressedFeedbackIds }) {
  return {
    sessionId,
    fromSubmissionId,
    toSubmissionId,
    addressedFeedbackIds,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Category-by-category delta between two evaluations of the same session
 * (Phase 38). A category present in one evaluation but not the other
 * (e.g. AI was unavailable for the first pass) gets a null delta rather
 * than a misleading number — see the note in rubricEngine.js.
 *
 * @param {EvaluationResult} previousEvaluation
 * @param {EvaluationResult} currentEvaluation
 * @returns {ImprovementDelta}
 */
export function computeImprovementDelta(previousEvaluation, currentEvaluation) {
  const prevByKey = Object.fromEntries(previousEvaluation.breakdown.map((b) => [b.key, b.rawScore]));
  const currByKey = Object.fromEntries(currentEvaluation.breakdown.map((b) => [b.key, b.rawScore]));
  const keys = new Set([...Object.keys(prevByKey), ...Object.keys(currByKey)]);

  const categoryDeltas = [...keys].map((key) => {
    const before = prevByKey[key] ?? null;
    const after = currByKey[key] ?? null;
    const delta = before != null && after != null ? Number((after - before).toFixed(2)) : null;
    return { key, before, after, delta };
  });

  return {
    totalScoreDelta: Number((currentEvaluation.totalScore - previousEvaluation.totalScore).toFixed(2)),
    categoryDeltas,
  };
}
