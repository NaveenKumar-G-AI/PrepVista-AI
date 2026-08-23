/**
 * Signal normalization (section 11).
 *
 * Different sources score on different scales. Everything gets normalized
 * to 0-100 for combination, but the raw score/max/method/timestamp is
 * always preserved alongside it so the normalized number is never the
 * only record of what actually happened.
 */

/**
 * @param {number} rawScore
 * @param {number} maxScore
 * @param {string} takenAt  ISO date string
 * @param {string} [method='linear100']
 * @returns {{normalized: number, raw: number, max: number, method: string, takenAt: string}}
 */
function normalizeScore(rawScore, maxScore, takenAt, method = 'linear100') {
  if (maxScore <= 0) {
    throw new Error(`normalizeScore: maxScore must be > 0, got ${maxScore}`);
  }
  const normalized = Math.round((rawScore / maxScore) * 100 * 100) / 100; // 2dp
  return {
    normalized: Math.max(0, Math.min(100, normalized)),
    raw: rawScore,
    max: maxScore,
    method,
    takenAt,
  };
}

/**
 * Averages the most recent `limit` normalized signals for a dimension,
 * weighting nothing by recency beyond "which ones are included" — kept
 * intentionally simple and documented, rather than a black-box weighting
 * scheme. Returns null (not 0) if there are no signals.
 *
 * @param {{normalized:number, takenAt:string}[]} signals
 * @param {number} [limit=3]
 * @returns {number|null}
 */
function aggregateDimensionSignals(signals, limit = 3) {
  if (!signals || signals.length === 0) return null;
  const sorted = [...signals].sort(
    (a, b) => new Date(b.takenAt) - new Date(a.takenAt)
  );
  const recent = sorted.slice(0, limit);
  const sum = recent.reduce((acc, s) => acc + s.normalized, 0);
  return Math.round((sum / recent.length) * 100) / 100;
}

module.exports = { normalizeScore, aggregateDimensionSignals };
