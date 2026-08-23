const { normalizeScore, aggregateDimensionSignals } = require('./signalNormalization');

/**
 * Current score per NAMED skill (e.g. "SQL"), distinct from the 6 broad
 * readiness dimensions — built from assessment skillArea + mock
 * interview skillScores. A skill with no signals is absent from the
 * result entirely, never defaulted to 0.
 */
async function getCurrentSkillScores(studentId, repos) {
  const bySkill = {};

  const assessments = (await repos.assessments.getRecentAssessments(studentId)) || [];
  for (const a of assessments) {
    if (!bySkill[a.skillArea]) bySkill[a.skillArea] = [];
    bySkill[a.skillArea].push(normalizeScore(a.rawScore, a.maxScore, a.takenAt, 'assessment'));
  }

  if (repos.mockInterviews) {
    const mocks = (await repos.mockInterviews.getMockInterviews(studentId)) || [];
    for (const m of mocks) {
      for (const [skill, score] of Object.entries(m.skillScores || {})) {
        if (!bySkill[skill]) bySkill[skill] = [];
        bySkill[skill].push({ normalized: score, raw: score, max: 100, method: 'mock_interview', takenAt: m.date });
      }
    }
  }

  const result = {};
  for (const [skill, signals] of Object.entries(bySkill)) {
    result[skill] = aggregateDimensionSignals(signals);
  }
  return result;
}

/**
 * @param {Object} targetProfile  { [skill]: { target: number, source: string } }
 *   `source` must name where the target came from (role config, drive
 *   requirement, institution setting) — section 24 forbids inventing
 *   targets, so an empty/missing profile is reported honestly, not
 *   filled in with a guess.
 */
async function calculateSkillGaps(studentId, { repos, targetProfile }) {
  if (!targetProfile || Object.keys(targetProfile).length === 0) {
    return { gaps: [], note: 'No target skill profile configured for this role — nothing to compare against.' };
  }

  const current = await getCurrentSkillScores(studentId, repos);
  const gaps = Object.entries(targetProfile).map(([skill, target]) => {
    const currentScore = current[skill] ?? null;
    return {
      skill,
      current: currentScore,
      target: target.target,
      gap: currentScore === null ? null : Math.round((target.target - currentScore) * 100) / 100,
      source: target.source,
      status: currentScore === null ? 'NO_DATA' : currentScore >= target.target ? 'MET' : 'GAP',
    };
  });

  return { gaps, note: null };
}

/**
 * Section 46 — institutional/department skill map. Buckets a cohort's
 * average per-skill score into Strong/Medium/Weak. Purely descriptive.
 */
function aggregateSkillDistribution(studentSkillScoreMaps, { strongThreshold = 70, weakThreshold = 50 } = {}) {
  const bySkill = {};
  for (const scores of studentSkillScoreMaps) {
    for (const [skill, value] of Object.entries(scores)) {
      if (value === null || value === undefined) continue;
      if (!bySkill[skill]) bySkill[skill] = [];
      bySkill[skill].push(value);
    }
  }

  return Object.entries(bySkill)
    .map(([skill, values]) => {
      const average = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
      const band = average >= strongThreshold ? 'STRONG' : average <= weakThreshold ? 'WEAK' : 'MEDIUM';
      return { skill, average, sampleSize: values.length, band };
    })
    .sort((a, b) => b.average - a.average);
}

module.exports = { getCurrentSkillScores, calculateSkillGaps, aggregateSkillDistribution };
