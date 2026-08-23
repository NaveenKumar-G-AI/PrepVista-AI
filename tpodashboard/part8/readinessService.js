const { normalizeScore, aggregateDimensionSignals } = require('./signalNormalization');
const { READINESS_MODEL_V1 } = require('../config/readinessConfig');

const DIMENSIONS = [
  'technical',
  'problemSolving',
  'communication',
  'interview',
  'roleReadiness',
  'profile',
];

/**
 * Pulls every signal relevant to one dimension. Returns [] (not a
 * default score) when nothing is available — section 17.
 */
async function gatherDimensionSignals(dimension, repos, studentId) {
  const signals = [];

  const assessments = (await repos.assessments.getRecentAssessments(studentId)) || [];
  for (const a of assessments.filter((x) => x.dimension === dimension)) {
    signals.push(normalizeScore(a.rawScore, a.maxScore, a.takenAt, 'assessment'));
  }

  if (dimension === 'interview' && repos.mockInterviews) {
    const mocks = (await repos.mockInterviews.getMockInterviews(studentId)) || [];
    for (const m of mocks) {
      signals.push({
        normalized: m.overallScore,
        raw: m.overallScore,
        max: 100,
        method: 'mock_interview',
        takenAt: m.date,
      });
    }
  }

  if (dimension === 'profile' && repos.profile) {
    const profile = await repos.profile.getProfileCompleteness(studentId);
    if (profile) {
      signals.push({
        normalized: profile.completenessPct,
        raw: profile.completenessPct,
        max: 100,
        method: 'profile_completeness',
        takenAt: new Date().toISOString(),
      });
    }
  }

  return signals;
}

async function calculateDimensionScores(studentId, repos) {
  const dimensionScores = {};
  const evidenceBySource = {};
  for (const dim of DIMENSIONS) {
    const signals = await gatherDimensionSignals(dim, repos, studentId);
    dimensionScores[dim] = aggregateDimensionSignals(signals); // null if signals is []
    evidenceBySource[dim] = signals;
  }
  return { dimensionScores, evidenceBySource };
}

/**
 * Weighted average over AVAILABLE dimensions only, renormalized so
 * missing dimensions don't silently drag the score down (section 12).
 * If too little of the total weight is covered, the overall score is
 * reported as unavailable rather than computed from a thin slice.
 */
function calculateOverallScore(dimensionScores, weights, minCoverage) {
  let totalWeight = 0;
  let coveredWeight = 0;
  let weightedSum = 0;

  for (const [dim, weight] of Object.entries(weights)) {
    totalWeight += weight;
    const score = dimensionScores[dim];
    if (score !== null && score !== undefined) {
      coveredWeight += weight;
      weightedSum += score * weight;
    }
  }

  const coverageFraction = totalWeight > 0 ? coveredWeight / totalWeight : 0;
  if (coveredWeight === 0 || coverageFraction < minCoverage) {
    return { overallScore: null, coverageFraction };
  }
  return {
    overallScore: Math.round((weightedSum / coveredWeight) * 100) / 100,
    coverageFraction,
  };
}

function determineBand(overallScore, bands) {
  if (overallScore === null || overallScore === undefined) return 'INSUFFICIENT_DATA';
  for (const band of bands) {
    if (overallScore >= band.min && overallScore <= band.max) return band.level;
  }
  return 'INSUFFICIENT_DATA';
}

/** Section 21 — transparent, threshold-based momentum. */
function calculateMomentum(currentScore, previousSnapshots, momentumConfig) {
  if (currentScore === null || currentScore === undefined) {
    return { state: 'INSUFFICIENT_DATA', evidence: 'No current overall score to compare.' };
  }
  const scored = previousSnapshots
    .filter((s) => s.overallScore !== null && s.overallScore !== undefined)
    .slice(-momentumConfig.windowSnapshots);

  if (scored.length < momentumConfig.minSnapshotsRequired) {
    return {
      state: 'INSUFFICIENT_DATA',
      evidence: `Only ${scored.length} prior scored snapshot(s) — need at least ${momentumConfig.minSnapshotsRequired}.`,
    };
  }

  const earliest = scored[0].overallScore;
  const delta = Math.round((currentScore - earliest) * 100) / 100;
  let state = 'STABLE';
  if (delta >= momentumConfig.risingThreshold) state = 'RISING';
  else if (delta <= momentumConfig.decliningThreshold) state = 'DECLINING';

  return {
    state,
    delta,
    evidence: `Readiness ${delta >= 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)} point(s) across the last ${scored.length} snapshots.`,
  };
}

/** Section 18-19 — strongest area, priority gap, what's missing. */
function buildEvidenceSummary(dimensionScores) {
  const scored = Object.entries(dimensionScores).filter(
    ([, v]) => v !== null && v !== undefined
  );
  const missingDimensions = Object.entries(dimensionScores)
    .filter(([, v]) => v === null || v === undefined)
    .map(([k]) => k);

  if (scored.length === 0) {
    return { strongest: null, priority: null, missingDimensions };
  }

  const sortedDesc = [...scored].sort((a, b) => b[1] - a[1]);
  return {
    strongest: { dimension: sortedDesc[0][0], score: sortedDesc[0][1] },
    priority: { dimension: sortedDesc[sortedDesc.length - 1][0], score: sortedDesc[sortedDesc.length - 1][1] },
    missingDimensions,
  };
}

/**
 * Full readiness snapshot for one student (section 15's schema).
 * `repos` must satisfy the contract in src/repositories/interfaces.js.
 */
async function calculateReadiness(
  studentId,
  { repos, previousSnapshots = [], model = READINESS_MODEL_V1, calculatedAt = new Date().toISOString() }
) {
  const { dimensionScores, evidenceBySource } = await calculateDimensionScores(studentId, repos);
  const { overallScore, coverageFraction } = calculateOverallScore(
    dimensionScores,
    model.dimensionWeights,
    model.minCoverageForOverallScore
  );
  const readinessLevel = determineBand(overallScore, model.bands);
  const momentum = calculateMomentum(overallScore, previousSnapshots, model.momentum);
  const evidenceSummary = buildEvidenceSummary(dimensionScores);

  return {
    studentId,
    calculationVersion: model.version,
    calculatedAt,
    overallScore,
    coverageFraction: Math.round(coverageFraction * 100) / 100,
    readinessLevel,
    dimensionScores,
    momentum,
    evidenceSummary,
    evidenceBySource, // raw underlying signals for drill-down (section 52)
  };
}

module.exports = {
  DIMENSIONS,
  calculateDimensionScores,
  calculateOverallScore,
  determineBand,
  calculateMomentum,
  buildEvidenceSummary,
  calculateReadiness,
};
