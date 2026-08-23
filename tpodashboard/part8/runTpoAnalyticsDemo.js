const { buildDemoDataset } = require('./fixtures');
const { seasonProgressFraction, PRIOR_SEASON_PLACEMENT_CURVE, CURRENT_SEASON } = require('../src/config/seasonCalendar');
const { calculateReadiness } = require('../src/services/readinessService');
const { calculateRisk } = require('../src/services/riskService');
const { eligibleDrivesForStudent, findQuickWins } = require('../src/services/eligibilityService');
const { computeSeasonFunnel, computeSeasonFunnelByGroup } = require('../src/services/funnelService');
const { assessZeroOfferRisk, findAtRiskOfZeroOffers } = require('../src/services/zeroOfferRiskService');
const { packageStats, packageStatsByGroup, packageDistribution } = require('../src/services/packageAnalyticsService');
const { driveConversionSummary, rankDrivesByConversion } = require('../src/services/driveCompanyPerformanceService');
const { seasonPacing } = require('../src/services/seasonPacingService');
const { departmentEquityFlags } = require('../src/services/departmentEquityService');
const { findUnconfirmedOfferHolders } = require('../src/services/offerHolderService');
const { buildActionQueue } = require('../src/services/tpoActionQueueService');

function line() { console.log('='.repeat(72)); }
function section(title) { line(); console.log(title); line(); }
function j(x) { return JSON.stringify(x, null, 2); }

function applicantsForDrive(driveId, contexts) {
  const result = [];
  for (const ctx of contexts) {
    const app = ctx.applications.find((a) => a.driveId === driveId);
    if (!app) continue;
    const interviewed = ctx.interviews.some((iv) => iv.driveId === driveId);
    const offer = ctx.offers.find((o) => o.driveId === driveId);
    result.push({
      studentId: ctx.studentId,
      status: app.status,
      interviewed,
      offered: !!offer,
      accepted: !!(offer && offer.accepted),
      joined: !!(offer && offer.joined),
    });
  }
  return result;
}

async function main() {
  const ds = buildDemoDataset();
  const now = new Date();
  const progress = seasonProgressFraction(now, CURRENT_SEASON);

  console.log(`Season ${CURRENT_SEASON.seasonId}: ${CURRENT_SEASON.startDate} -> ${CURRENT_SEASON.endDate}`);
  console.log(`Today: ${now.toISOString().slice(0, 10)}  |  Season progress: ${(progress * 100).toFixed(1)}%`);

  // --- Build one full context per registered student -------------------
  const studentIds = Object.keys(ds.roster);
  const contexts = [];
  for (const studentId of studentIds) {
    const entry = ds.roster[studentId];
    const repos = entry.repos;
    const academic = await repos.academic.getAcademicProfile();
    const profile = await repos.profile.getProfileCompleteness();
    const applications = (await repos.applications.getApplications()) || [];
    const interviews = (await repos.interviews.getInterviews()) || [];
    const offers = (await repos.offers.getOffers()) || [];
    const interventions = (await repos.interventions.getInterventions()) || [];

    const studentForEligibility = {
      studentId,
      cgpa: academic.cgpa,
      backlogs: academic.backlogs,
      department: academic.department,
      profileCompletenessPct: profile ? profile.completenessPct : 0,
    };
    const eligibleDrives = eligibleDrivesForStudent(studentForEligibility, ds.drives);

    let readinessSnapshot = null;
    try {
      readinessSnapshot = await calculateReadiness(studentId, { repos });
    } catch (e) {
      readinessSnapshot = null;
    }

    contexts.push({
      studentId,
      department: academic.department,
      academic,
      profile,
      applications,
      interviews,
      offers,
      interventions,
      studentForEligibility,
      eligibleDrives,
      isEligibleForAny: eligibleDrives.length > 0,
      readinessSnapshot,
    });
  }

  // --- 1. SEASON FUNNEL --------------------------------------------------
  section('1. SEASON FUNNEL — registered through joined, all 12 students');
  const funnelInputs = contexts.map((c) => ({
    studentId: c.studentId,
    department: c.department,
    isEligibleForAny: c.isEligibleForAny,
    applications: c.applications,
    interviews: c.interviews,
    offers: c.offers,
  }));
  console.log(j(computeSeasonFunnel(funnelInputs)));

  section('2. SEASON FUNNEL BY DEPARTMENT');
  console.log(j(computeSeasonFunnelByGroup(funnelInputs, 'department')));

  // --- 3. ZERO-OFFER RISK -------------------------------------------------
  section('3. ZERO-OFFER RISK — every student');
  const zeroOfferResults = contexts.map((c) =>
    assessZeroOfferRisk(c.studentId, {
      applications: c.applications,
      interviews: c.interviews,
      offers: c.offers,
      readinessSnapshot: c.readinessSnapshot,
      seasonProgressFraction: progress,
      eligibleDriveCount: c.eligibleDrives.length,
      profileCompletenessPct: c.profile ? c.profile.completenessPct : null,
    })
  );
  console.log(j(zeroOfferResults));

  section('4. STUDENTS AT RISK OF ZERO OFFERS (HIGH/CRITICAL only, sorted)');
  console.log(j(findAtRiskOfZeroOffers(zeroOfferResults)));

  // --- 5. PACKAGE / CTC ANALYTICS -----------------------------------------
  section('5. PACKAGE ANALYTICS — accepted offers only, all students');
  const acceptedOffersWithDept = contexts.flatMap((c) =>
    c.offers.filter((o) => o.accepted).map((o) => ({ ...o, department: c.department }))
  );
  console.log('Overall:', j(packageStats(acceptedOffersWithDept)));
  console.log('By department:', j(packageStatsByGroup(acceptedOffersWithDept, 'department')));
  console.log('Distribution:', j(packageDistribution(acceptedOffersWithDept)));

  // --- 6. DRIVE / COMPANY PERFORMANCE -------------------------------------
  section('6. DRIVE PERFORMANCE — every drive in the catalog');
  const driveSummaries = ds.drives.map((drive) => {
    const eligiblePoolSize = contexts.filter((c) => c.eligibleDrives.some((d) => d.driveId === drive.driveId)).length;
    return driveConversionSummary(drive, applicantsForDrive(drive.driveId, contexts), eligiblePoolSize);
  });
  console.log(j(driveSummaries));

  section('7. DRIVE RANKING BY CONVERSION (min 1 applicant for this small demo)');
  console.log(j(rankDrivesByConversion(driveSummaries, { minApplied: 1 })));

  // --- 8. ELIGIBILITY QUICK WINS ------------------------------------------
  section('8. ELIGIBILITY QUICK WINS — blocked by exactly one fixable criterion');
  console.log(j(findQuickWins(contexts.map((c) => c.studentForEligibility), ds.drives)));

  // --- 9. SEASON PACING ----------------------------------------------------
  section('9. SEASON PACING vs prior-season curve');
  const placedCount = contexts.filter((c) => c.offers.some((o) => o.accepted)).length;
  const currentPlacedPct = (placedCount / contexts.length) * 100;
  console.log(`Placed so far: ${placedCount}/${contexts.length} = ${currentPlacedPct.toFixed(1)}%`);
  console.log(j(seasonPacing(currentPlacedPct, progress, PRIOR_SEASON_PLACEMENT_CURVE)));

  // --- 10. DEPARTMENT EQUITY ------------------------------------------------
  section('10. DEPARTMENT EQUITY FLAGS');
  const byDept = {};
  for (const c of contexts) {
    (byDept[c.department] = byDept[c.department] || []).push(c);
  }
  const departmentStats = {};
  for (const [dept, members] of Object.entries(byDept)) {
    const scored = members.map((m) => m.readinessSnapshot?.overallScore).filter((v) => v !== null && v !== undefined);
    const placed = members.filter((m) => m.offers.some((o) => o.accepted)).length;
    departmentStats[dept] = {
      studentCount: members.length,
      avgReadiness: scored.length > 0 ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100 : null,
      placedPct: Math.round((placed / members.length) * 10000) / 100,
    };
  }
  console.log('Department stats:', j(departmentStats));
  console.log('Flags:', j(departmentEquityFlags(departmentStats, { minStudents: 2, minGapPts: 5 })));

  // --- 11. UNCONFIRMED OFFER HOLDERS ---------------------------------------
  section('11. UNCONFIRMED OFFER HOLDERS (>= 7 days)');
  console.log(j(findUnconfirmedOfferHolders(contexts.map((c) => ({ studentId: c.studentId, offers: c.offers })))));

  // --- 12. TPO ACTION QUEUE -------------------------------------------------
  section('12. TPO ACTION QUEUE — everything synthesized into one prioritized list');
  const highRiskStudents = [];
  for (const c of contexts) {
    if (!c.readinessSnapshot) continue;
    const risk = await calculateRisk(c.studentId, { readinessSnapshot: c.readinessSnapshot, repos: ds.roster[c.studentId].repos });
    if (risk.level === 'HIGH' || risk.level === 'CRITICAL') highRiskStudents.push(risk);
  }
  const quickWins = findQuickWins(contexts.map((c) => c.studentForEligibility), ds.drives);
  const upcomingDeadlines = ds.drives
    .map((d) => ({ driveId: d.driveId, company: d.company, daysLeft: Math.ceil((new Date(d.applicationDeadline) - now) / 86400000) }))
    .filter((d) => d.daysLeft > 0 && d.daysLeft <= 14);
  const overdueInterventions = contexts.flatMap((c) =>
    c.interventions
      .filter((iv) => !iv.completedAt)
      .map((iv) => ({ studentId: c.studentId, interventionId: iv.id, daysOverdue: Math.round((now - new Date(iv.assignedAt)) / 86400000) }))
  );

  const actionQueue = buildActionQueue({
    highRiskStudents,
    zeroOfferRiskResults: zeroOfferResults,
    quickWins,
    upcomingDeadlines,
    overdueInterventions,
  });
  console.log(j(actionQueue));

  line();
  console.log(`Action queue: ${actionQueue.length} items. Every number above came from src/services, none hand-written here.`);
}

main().catch((err) => {
  console.error('TPO DEMO FAILED:', err);
  process.exit(1);
});
