/**
 * Readiness model configuration.
 *
 * This is deliberately DATA, not logic — the spec (sections 13, 14, 67, 68)
 * is explicit that weights/bands/thresholds are institution- and
 * season-specific decisions, not engineering constants. Treat the numbers
 * below as an example seed, not a recommendation. In a real system this
 * would live in a `readiness_model_config` table (see the SQL migration)
 * so it can be versioned and changed without a deploy.
 */

const READINESS_MODEL_V1 = {
  version: 'v1',
  effectiveFrom: '2026-01-01',

  // Must sum to 100. Renormalized at calculation time over whichever
  // dimensions actually have data for a given student (section 12: "do
  // not require every dimension").
  dimensionWeights: {
    technical: 25,
    problemSolving: 15,
    communication: 15,
    interview: 20,
    roleReadiness: 15,
    profile: 10,
  },

  // Section 16. Bands are checked top-down on the overall score.
  // INSUFFICIENT_DATA is a separate status, not a band on the 0-100 line.
  bands: [
    { level: 'READY', min: 80, max: 100 },
    { level: 'ALMOST_READY', min: 65, max: 79 },
    { level: 'DEVELOPING', min: 50, max: 64 },
    { level: 'HIGH_RISK', min: 0, max: 49 },
  ],

  // If the weight covered by AVAILABLE dimensions falls below this
  // fraction of total weight, the overall score is reported as
  // INSUFFICIENT_DATA rather than computed from a thin slice of signals.
  minCoverageForOverallScore: 0.5,

  // Section 21 — momentum thresholds. Compares the most recent snapshot
  // against the snapshot `momentumWindowSnapshots` back.
  momentum: {
    windowSnapshots: 4,
    risingThreshold: 5, // >= +5 points over the window => RISING
    decliningThreshold: -5, // <= -5 points over the window => DECLINING
    minSnapshotsRequired: 2, // fewer than this => INSUFFICIENT_DATA
  },

  // Section 22 — only flag a change as meaningful above this delta.
  changeDetectionThreshold: 6,
};

// Section 36-38. Risk severity requires a minimum number of independent
// signals before it can reach MEDIUM or above — a single weak signal is
// never enough (section 38's false-positive safeguard).
const RISK_MODEL_V1 = {
  version: 'v1',
  minSignalsForMedium: 2,
  severityBySignalCount: [
    { minSignals: 4, level: 'CRITICAL' },
    { minSignals: 3, level: 'HIGH' },
    { minSignals: 2, level: 'MEDIUM' },
    { minSignals: 1, level: 'LOW' },
    { minSignals: 0, level: 'NONE' },
  ],
  // Individual signal thresholds — also treat these as institution
  // decisions, not fixed truths.
  thresholds: {
    lowReadinessScore: 50,
    assessmentFailScore: 40,
    consecutiveFailuresForSignal: 2,
    lowAttendancePct: 50,
    interviewFailScore: 50,
    interviewFailuresForSignal: 2,
    incompleteProfilePct: 70,
    staleAssessmentDays: 45,
  },
};

// Section 53 — statistical safety. Cohort/outcome comparisons below this
// count are reported as "insufficient data for reliable comparison"
// rather than a misleading average.
const STATISTICAL_SAFETY = {
  minSampleSizeForCohortStats: 5,
  minSampleSizeForOutcomeCorrelation: 10,
};

module.exports = {
  READINESS_MODEL_V1,
  RISK_MODEL_V1,
  STATISTICAL_SAFETY,
};
