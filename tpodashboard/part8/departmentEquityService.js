function round2(n) {
  return Math.round(n * 100) / 100;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : round2((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Compares each department's ACTUAL placed% against what you'd expect
 * from its average readiness, using the institution's own median
 * readiness→placement efficiency as the yardstick — so this never
 * imports an external assumption about what "good" looks like, only
 * asks whether one department is converting readiness into placement
 * as well as the rest of the institution is.
 *
 * Deliberately conservative: needs at least 2 comparable departments
 * and a minimum sample per department, and reports a gap, not a
 * verdict — section 54's correlation-vs-causation discipline applied
 * to department comparisons instead of training effectiveness.
 *
 * @param {Object} departmentStats  { [dept]: {avgReadiness, placedPct, studentCount} }
 */
function departmentEquityFlags(departmentStats, { minStudents = 5, minGapPts = 15 } = {}) {
  const eligible = Object.entries(departmentStats).filter(
    ([, s]) => s.studentCount >= minStudents && s.avgReadiness != null && s.avgReadiness > 0 && s.placedPct != null
  );

  if (eligible.length < 2) {
    return { flags: [], note: 'Not enough departments with sufficient sample size to compare.' };
  }

  const withEfficiency = eligible.map(([dept, s]) => ({ dept, efficiency: s.placedPct / s.avgReadiness, ...s }));
  const medEfficiency = median(withEfficiency.map((e) => e.efficiency));

  const flags = withEfficiency
    .map((e) => {
      const expectedPlacedPct = round2(e.avgReadiness * medEfficiency);
      return { ...e, expectedPlacedPct, gapPts: round2(expectedPlacedPct - e.placedPct) };
    })
    .filter((e) => e.gapPts >= minGapPts)
    .sort((a, b) => b.gapPts - a.gapPts)
    .map((e) => ({
      department: e.dept,
      studentCount: e.studentCount,
      avgReadiness: e.avgReadiness,
      actualPlacedPct: e.placedPct,
      expectedPlacedPct: e.expectedPlacedPct,
      gapPts: e.gapPts,
    }));

  return {
    flags,
    note:
      flags.length > 0
        ? 'Departments placing notably below what their average readiness predicts, relative to the institution median — an observed disparity worth investigating, not a claim about cause.'
        : 'No department is placing meaningfully below what its readiness would predict.',
  };
}

module.exports = { departmentEquityFlags };
