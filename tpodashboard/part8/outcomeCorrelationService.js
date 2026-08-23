const { STATISTICAL_SAFETY } = require('../config/readinessConfig');

const HIGH_READINESS_LEVELS = ['READY', 'ALMOST_READY'];

/**
 * Section 26 — the readiness x application quadrants. This is
 * descriptive segmentation of real students, not a rate, so it isn't
 * gated by minimum sample size the way the rate helpers below are — a
 * quadrant of 3 students is still 3 real students a TPO can act on.
 *
 * @param {{studentId: string, readinessLevel: string, hasApplied: boolean}[]} students
 */
function segmentReadinessVsApplication(students) {
  const segments = {
    HIGH_READINESS_APPLIED: [],
    HIGH_READINESS_NOT_APPLIED: [],
    LOW_READINESS_APPLIED: [],
    LOW_READINESS_NOT_APPLIED: [],
    INSUFFICIENT_DATA: [],
  };

  for (const s of students) {
    if (s.readinessLevel === 'INSUFFICIENT_DATA') {
      segments.INSUFFICIENT_DATA.push(s.studentId);
      continue;
    }
    const high = HIGH_READINESS_LEVELS.includes(s.readinessLevel);
    const key = `${high ? 'HIGH' : 'LOW'}_READINESS_${s.hasApplied ? 'APPLIED' : 'NOT_APPLIED'}`;
    segments[key].push(s.studentId);
  }
  return segments;
}

/**
 * Shared helper for "readiness band vs an observed outcome rate"
 * (sections 27-29: interview progression, offer rate, ...). Always
 * labels the result as an observed association, never a causal claim
 * (section 54), and refuses bands below the minimum sample size.
 *
 * @param {{readinessLevel: string, outcomeAchieved: boolean}[]} records
 */
function readinessBandVsOutcomeRate(
  records,
  { minSampleSize = STATISTICAL_SAFETY.minSampleSizeForOutcomeCorrelation } = {}
) {
  const byBand = {};
  for (const r of records) {
    if (!byBand[r.readinessLevel]) byBand[r.readinessLevel] = { total: 0, achieved: 0 };
    byBand[r.readinessLevel].total += 1;
    if (r.outcomeAchieved) byBand[r.readinessLevel].achieved += 1;
  }

  const result = {};
  for (const [band, counts] of Object.entries(byBand)) {
    if (counts.total < minSampleSize) {
      result[band] = {
        sampleSize: counts.total,
        rate: null,
        note: `Insufficient data for reliable comparison — ${counts.total} student(s), need at least ${minSampleSize}.`,
      };
      continue;
    }
    result[band] = {
      sampleSize: counts.total,
      rate: Math.round((counts.achieved / counts.total) * 10000) / 100, // percent
      interpretation: 'OBSERVED_ASSOCIATION', // deliberately never 'CAUSED_BY'
    };
  }
  return result;
}

/**
 * Section 29-30 — pre/post comparison for training or an intervention.
 * Reports the observed average change only. The `note` is meant to
 * travel with this number wherever it's displayed.
 *
 * @param {{before: number|null, after: number|null}[]} pairs
 */
function observedPrePostChange(pairs) {
  const valid = pairs.filter((p) => p.before !== null && p.after !== null);
  if (valid.length < STATISTICAL_SAFETY.minSampleSizeForOutcomeCorrelation) {
    return {
      sampleSize: valid.length,
      averageChange: null,
      note: `Insufficient data for reliable comparison — ${valid.length} paired observation(s).`,
    };
  }
  const deltas = valid.map((p) => p.after - p.before);
  return {
    sampleSize: valid.length,
    averageChange: Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100,
    note: 'Observed change only — not a causal claim of effectiveness.',
  };
}

module.exports = { segmentReadinessVsApplication, readinessBandVsOutcomeRate, observedPrePostChange };
