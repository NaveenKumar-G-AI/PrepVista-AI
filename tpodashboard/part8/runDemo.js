const { buildDemoDataset } = require('./fixtures');
const { calculateReadiness } = require('../src/services/readinessService');
const { calculateRisk } = require('../src/services/riskService');
const { calculateSkillGaps } = require('../src/services/skillIntelligenceService');
const { aggregateCohort } = require('../src/services/cohortAnalyticsService');
const {
  segmentReadinessVsApplication,
  readinessBandVsOutcomeRate,
} = require('../src/services/outcomeCorrelationService');
const tools = require('../src/ai/tools');

function line() {
  console.log('-'.repeat(70));
}
function section(title) {
  line();
  console.log(title);
  line();
}

async function main() {
  const ds = buildDemoDataset();

  section('1. STUDENT — strong profile (stu_priya)');
  const priyaSnap = await calculateReadiness(ds.priya.studentId, { repos: ds.priya.repos });
  console.log(JSON.stringify(priyaSnap, null, 2));
  const priyaRisk = await calculateRisk(ds.priya.studentId, {
    readinessSnapshot: priyaSnap,
    repos: ds.priya.repos,
  });
  console.log('Risk:', JSON.stringify(priyaRisk, null, 2));

  section('2. STUDENT — struggling, BEFORE intervention (stu_arjun)');
  const arjunBeforeSnap = await calculateReadiness(ds.arjunBefore.studentId, { repos: ds.arjunBefore.repos });
  console.log(JSON.stringify(arjunBeforeSnap, null, 2));
  const arjunBeforeRisk = await calculateRisk(ds.arjunBefore.studentId, {
    readinessSnapshot: arjunBeforeSnap,
    repos: ds.arjunBefore.repos,
  });
  console.log('Risk:', JSON.stringify(arjunBeforeRisk, null, 2));

  section('3. STUDENT — same student, AFTER a completed intervention (stu_arjun)');
  const arjunAfterSnap = await calculateReadiness(ds.arjunAfter.studentId, {
    repos: ds.arjunAfter.repos,
    previousSnapshots: ds.arjunAfter.previousSnapshots,
  });
  console.log(JSON.stringify(arjunAfterSnap, null, 2));
  const arjunAfterRisk = await calculateRisk(ds.arjunAfter.studentId, {
    readinessSnapshot: arjunAfterSnap,
    repos: ds.arjunAfter.repos,
    previousRiskState: arjunBeforeRisk,
  });
  console.log('Risk:', JSON.stringify(arjunAfterRisk, null, 2));

  console.log(
    `\n>>> Readiness moved ${arjunBeforeSnap.overallScore} -> ${arjunAfterSnap.overallScore} ` +
      `(${arjunAfterSnap.momentum.state}: ${arjunAfterSnap.momentum.evidence})`
  );
  console.log(`>>> Risk moved ${arjunBeforeRisk.level} -> ${arjunAfterRisk.level}`);

  section('4. STUDENT — partial data (stu_kavya): INSUFFICIENT_DATA safeguard');
  const kavyaSnap = await calculateReadiness(ds.kavya.studentId, { repos: ds.kavya.repos });
  console.log(JSON.stringify(kavyaSnap, null, 2));

  section('5. SKILL GAPS — stu_arjun (after) vs a role target profile');
  const targetProfile = {
    DSA: { target: 70, source: 'Software Engineer role config' },
    'System Design': { target: 65, source: 'Software Engineer role config' },
    Verbal: { target: 60, source: 'Software Engineer role config' },
  };
  const gaps = await calculateSkillGaps(ds.arjunAfter.studentId, { repos: ds.arjunAfter.repos, targetProfile });
  console.log(JSON.stringify(gaps, null, 2));

  section('6. SKILL GAPS — no target profile supplied (must not invent one)');
  const noTarget = await calculateSkillGaps(ds.priya.studentId, { repos: ds.priya.repos, targetProfile: {} });
  console.log(JSON.stringify(noTarget, null, 2));

  section('7. COHORT — 3 students, default minimum sample size (5): honest refusal');
  console.log(JSON.stringify(aggregateCohort([priyaSnap, arjunBeforeSnap, kavyaSnap]), null, 2));

  section('8. COHORT — same 3, minSampleSize explicitly lowered to 2');
  console.log(JSON.stringify(aggregateCohort([priyaSnap, arjunBeforeSnap, kavyaSnap], { minSampleSize: 2 }), null, 2));

  section('9. READINESS x APPLICATION segmentation');
  const segmentInput = [
    { studentId: 'stu_priya', readinessLevel: priyaSnap.readinessLevel, hasApplied: true },
    { studentId: 'stu_arjun', readinessLevel: arjunAfterSnap.readinessLevel, hasApplied: true },
    { studentId: 'stu_kavya', readinessLevel: kavyaSnap.readinessLevel, hasApplied: false },
  ];
  console.log(JSON.stringify(segmentReadinessVsApplication(segmentInput), null, 2));

  section('10. READINESS x INTERVIEW RATE — below minimum sample size (honest refusal)');
  const outcomeRecords = [
    { readinessLevel: 'READY', outcomeAchieved: true },
    { readinessLevel: 'READY', outcomeAchieved: false },
    { readinessLevel: 'HIGH_RISK', outcomeAchieved: false },
  ];
  console.log(JSON.stringify(readinessBandVsOutcomeRate(outcomeRecords), null, 2));

  section('11. AI TOOL CONTRACT — generateInsights() on stu_arjun BEFORE state');
  console.log(JSON.stringify(tools.generateInsights(arjunBeforeSnap, arjunBeforeRisk, {}), null, 2));

  section('12. AI TOOL CONTRACT — getHighRiskStudents() across the demo cohort');
  const highRisk = tools.getHighRiskStudents([priyaRisk, arjunBeforeRisk, arjunAfterRisk]);
  console.log(JSON.stringify(highRisk.map((r) => ({ studentId: r.studentId, level: r.level })), null, 2));

  line();
  console.log('Demo complete — every number above was computed by src/services, none hand-written in this script.');
}

main().catch((err) => {
  console.error('DEMO FAILED:', err);
  process.exit(1);
});
