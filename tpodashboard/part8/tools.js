const { calculateReadiness } = require('../services/readinessService');
const { calculateRisk } = require('../services/riskService');
const { calculateSkillGaps } = require('../services/skillIntelligenceService');
const { aggregateCohort, aggregateByGroup } = require('../services/cohortAnalyticsService');
const {
  segmentReadinessVsApplication,
  readinessBandVsOutcomeRate,
  observedPrePostChange,
} = require('../services/outcomeCorrelationService');
const { checkEligibility, findQuickWins, eligibleDrivesForStudent } = require('../services/eligibilityService');
const { computeSeasonFunnel, computeSeasonFunnelByGroup, computeDriveFunnel } = require('../services/funnelService');
const { assessZeroOfferRisk, findAtRiskOfZeroOffers } = require('../services/zeroOfferRiskService');
const { packageStats, packageStatsByGroup, packageDistribution } = require('../services/packageAnalyticsService');
const { driveConversionSummary, rankDrivesByConversion } = require('../services/driveCompanyPerformanceService');
const { seasonPacing } = require('../services/seasonPacingService');
const { departmentEquityFlags } = require('../services/departmentEquityService');
const { findUnconfirmedOfferHolders } = require('../services/offerHolderService');
const { buildActionQueue } = require('../services/tpoActionQueueService');

/**
 * Section 56-58 — the tool surface a future AI layer consumes. Every
 * function here returns a value a service already computed; none of
 * them let an LLM estimate a number the system could calculate itself.
 * Names follow section 56's list as closely as the simplified data
 * model allows.
 */

async function getStudentReadiness(studentId, ctx) {
  return calculateReadiness(studentId, ctx);
}

function getStudentReadinessTrend(previousSnapshots) {
  return previousSnapshots
    .filter((s) => s.overallScore !== null && s.overallScore !== undefined)
    .map((s) => ({ calculatedAt: s.calculatedAt, overallScore: s.overallScore }));
}

async function getStudentSkillProfile(studentId, ctx) {
  return calculateSkillGaps(studentId, ctx);
}

const getSkillGaps = getStudentSkillProfile;

async function getStudentRisk(studentId, ctx) {
  const readinessSnapshot = ctx.readinessSnapshot || (await calculateReadiness(studentId, ctx));
  return calculateRisk(studentId, { ...ctx, readinessSnapshot });
}

async function getStudentTraining(studentId, repos) {
  return (await repos.training.getTrainingHistory(studentId)) || [];
}

async function getStudentInterventions(studentId, repos) {
  return (await repos.interventions.getInterventions(studentId)) || [];
}

function getCohortReadiness(snapshots, opts) {
  return aggregateCohort(snapshots, opts);
}

function getDepartmentReadiness(snapshotsWithDept, opts) {
  return aggregateByGroup(snapshotsWithDept, 'department', opts);
}

function getBatchReadiness(snapshotsWithBatch, opts) {
  return aggregateByGroup(snapshotsWithBatch, 'batch', opts);
}

function getHighRiskStudents(riskResults) {
  return riskResults.filter((r) => r.level === 'HIGH' || r.level === 'CRITICAL');
}

function getTopImprovers(readinessResults, limit = 10) {
  return readinessResults
    .filter((r) => r.momentum?.state === 'RISING' && typeof r.momentum.delta === 'number')
    .sort((a, b) => b.momentum.delta - a.momentum.delta)
    .slice(0, limit);
}

function getReadinessApplicationRelationship(students) {
  return segmentReadinessVsApplication(students);
}

function getReadinessInterviewRelationship(records, opts) {
  return readinessBandVsOutcomeRate(records, opts);
}

function getReadinessOfferRelationship(records, opts) {
  return readinessBandVsOutcomeRate(records, opts);
}

function getTrainingEffectiveness(prePostPairs) {
  return observedPrePostChange(prePostPairs);
}

function getInterventionEffectiveness(prePostPairs) {
  return observedPrePostChange(prePostPairs);
}

/**
 * Section 57 — structured insight objects. Pure translation from
 * already-computed numbers into a typed event; computes nothing new.
 */
function generateInsights(readinessSnapshot, riskResult, { previousScore = null, periodDays = null } = {}) {
  const insights = [];

  if (readinessSnapshot.momentum.state === 'DECLINING' && previousScore !== null && readinessSnapshot.overallScore !== null) {
    insights.push({
      type: 'READINESS_DECLINE',
      priority: riskResult.level === 'HIGH' || riskResult.level === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
      student_id: readinessSnapshot.studentId,
      evidence: {
        previous_score: previousScore,
        current_score: readinessSnapshot.overallScore,
        period_days: periodDays,
      },
      recommended_action: `Review recent ${readinessSnapshot.evidenceSummary.priority?.dimension || 'lowest-scoring'} signals.`,
    });
  }

  if (riskResult.level === 'HIGH' || riskResult.level === 'CRITICAL') {
    insights.push({
      type: 'HIGH_RISK_DETECTED',
      priority: riskResult.level,
      student_id: readinessSnapshot.studentId,
      evidence: { signal_count: riskResult.signalCount, signals: riskResult.signals.map((s) => s.type) },
      recommended_action: 'Assign or review an intervention.',
    });
  }

  return insights;
}

function generateHighReadinessUnappliedInsight(segments) {
  const count = segments.HIGH_READINESS_NOT_APPLIED.length;
  if (count === 0) return null;
  return {
    type: 'HIGH_READINESS_UNAPPLIED',
    priority: 'HIGH',
    evidence: { student_count: count },
    recommended_action: 'Review eligible active drives for these students.',
  };
}

// --- TPO-facing analytics (funnel, zero-offer risk, package, drives,
// eligibility, pacing, equity, action queue) — same discipline as above:
// every function here returns something a service already computed.

function getStudentEligibility(student, drive) {
  return checkEligibility(student, drive);
}

function getEligibleDrives(student, drives) {
  return eligibleDrivesForStudent(student, drives);
}

function getQuickWinEligibility(students, drives) {
  return findQuickWins(students, drives);
}

function getSeasonFunnel(studentFunnelInputs) {
  return computeSeasonFunnel(studentFunnelInputs);
}

function getSeasonFunnelByDepartment(studentFunnelInputsWithDept) {
  return computeSeasonFunnelByGroup(studentFunnelInputsWithDept, 'department');
}

function getDriveFunnel(applicantsForDrive, eligiblePoolSize) {
  return computeDriveFunnel(applicantsForDrive, eligiblePoolSize);
}

function getZeroOfferRisk(studentId, ctx) {
  return assessZeroOfferRisk(studentId, ctx);
}

function getStudentsAtRiskOfZeroOffers(assessments) {
  return findAtRiskOfZeroOffers(assessments);
}

function getPackageStats(offers) {
  return packageStats(offers);
}

function getPackageStatsByDepartment(offersWithDept) {
  return packageStatsByGroup(offersWithDept, 'department');
}

function getPackageDistribution(offers) {
  return packageDistribution(offers);
}

function getDrivePerformance(drive, applicantsForDrive, eligiblePoolSize) {
  return driveConversionSummary(drive, applicantsForDrive, eligiblePoolSize);
}

function getDriveRanking(driveSummaries, opts) {
  return rankDrivesByConversion(driveSummaries, opts);
}

function getSeasonPacing(currentPlacedPct, progressFraction, priorSeasonCurve) {
  return seasonPacing(currentPlacedPct, progressFraction, priorSeasonCurve);
}

function getDepartmentEquityFlags(departmentStats, opts) {
  return departmentEquityFlags(departmentStats, opts);
}

function getUnconfirmedOfferHolders(studentsWithOffers, opts) {
  return findUnconfirmedOfferHolders(studentsWithOffers, opts);
}

function getTpoActionQueue(inputs) {
  return buildActionQueue(inputs);
}

module.exports = {
  getStudentReadiness,
  getStudentReadinessTrend,
  getStudentSkillProfile,
  getSkillGaps,
  getStudentRisk,
  getStudentTraining,
  getStudentInterventions,
  getCohortReadiness,
  getDepartmentReadiness,
  getBatchReadiness,
  getHighRiskStudents,
  getTopImprovers,
  getReadinessApplicationRelationship,
  getReadinessInterviewRelationship,
  getReadinessOfferRelationship,
  getTrainingEffectiveness,
  getInterventionEffectiveness,
  generateInsights,
  generateHighReadinessUnappliedInsight,
  getStudentEligibility,
  getEligibleDrives,
  getQuickWinEligibility,
  getSeasonFunnel,
  getSeasonFunnelByDepartment,
  getDriveFunnel,
  getZeroOfferRisk,
  getStudentsAtRiskOfZeroOffers,
  getPackageStats,
  getPackageStatsByDepartment,
  getPackageDistribution,
  getDrivePerformance,
  getDriveRanking,
  getSeasonPacing,
  getDepartmentEquityFlags,
  getUnconfirmedOfferHolders,
  getTpoActionQueue,
};
