const { STATISTICAL_SAFETY } = require('../config/readinessConfig');

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

/**
 * Aggregates a set of readiness snapshots into a distribution + average
 * + median. Refuses to produce comparison stats below the minimum
 * sample size (section 53) — returns the honest counts instead of a
 * misleading average from too few students. INSUFFICIENT_DATA students
 * are counted in the distribution but never folded into the scored
 * denominator.
 */
function aggregateCohort(snapshots, { minSampleSize = STATISTICAL_SAFETY.minSampleSizeForCohortStats } = {}) {
  const distribution = {
    READY: 0,
    ALMOST_READY: 0,
    DEVELOPING: 0,
    HIGH_RISK: 0,
    INSUFFICIENT_DATA: 0,
  };
  const scored = [];

  for (const snap of snapshots) {
    distribution[snap.readinessLevel] = (distribution[snap.readinessLevel] || 0) + 1;
    if (snap.overallScore !== null && snap.overallScore !== undefined) scored.push(snap.overallScore);
  }

  if (scored.length < minSampleSize) {
    return {
      totalStudents: snapshots.length,
      distribution,
      scoredCount: scored.length,
      average: null,
      median: null,
      note: `Insufficient data for reliable comparison — only ${scored.length} scored student(s), need at least ${minSampleSize}.`,
    };
  }

  return {
    totalStudents: snapshots.length,
    distribution,
    scoredCount: scored.length,
    average: Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100,
    median: median(scored),
    note: null,
  };
}

/**
 * Groups snapshots by an arbitrary key (department, batch, role) and
 * aggregates each group independently — the same sample-size safeguard
 * applies per group, so a large institution can still have individual
 * departments reported as insufficient data.
 *
 * @param {{snapshot: object, [groupKey]: string}[]} snapshotsWithGroup
 */
function aggregateByGroup(snapshotsWithGroup, groupKey, opts) {
  const groups = {};
  for (const item of snapshotsWithGroup) {
    const key = item[groupKey];
    if (!groups[key]) groups[key] = [];
    groups[key].push(item.snapshot);
  }
  const result = {};
  for (const [key, snaps] of Object.entries(groups)) {
    result[key] = aggregateCohort(snaps, opts);
  }
  return result;
}

module.exports = { median, aggregateCohort, aggregateByGroup };
