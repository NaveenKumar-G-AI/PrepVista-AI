'use strict';

const store = require('../src/db/memoryStore');
const { seedDemoData, DEMO_STUDENT_ID } = require('../src/seed/demoData');
const opportunityService = require('../src/services/opportunityService');
const applicationService = require('../src/services/applicationService');
const outcomeService = require('../src/services/outcomeService');
const { buildAIProvider } = require('../src/ai/aiProvider');
const simulationService = require('../src/integrations/simulationService');

function section(title) { console.log(`\n=== ${title} ===`); }

async function main() {
  const aiProvider = buildAIProvider();
  console.log(`AI provider: ${aiProvider.isAvailable() ? 'Anthropic (configured)' : 'rule-based (no API key set - this is expected out of the box)'}`);

  section('1. INGEST + NORMALIZE + EXTRACT REQUIREMENTS');
  const { opportunity } = await seedDemoData({ aiProvider });
  console.log(`Opportunity: ${opportunity.title} @ ${opportunity.organization}`);
  console.log(`Status: ${opportunity.status} | Deadline: ${opportunity.deadline}`);
  store.getRequirements(opportunity.id).forEach((r) => {
    console.log(`  [${r.requirementType}/${r.importance}] "${r.sourceText}" -> ${r.capabilityId || 'UNMAPPED'} (confidence: ${r.confidence})`);
  });

  section('2. ANALYZE (ELIGIBILITY + MULTI-DIMENSIONAL MATCH + GAPS + RECOMMENDATION)');
  const { analysis } = await opportunityService.analyzeOpportunityForStudent(opportunity.id, DEMO_STUDENT_ID, { aiProvider });
  console.log('Eligibility:', analysis.eligibility.state);
  analysis.eligibility.reasons.forEach((r) => console.log(`  - ${r}`));
  console.log('\nFit dimensions:');
  Object.entries(analysis.match.dimensions).forEach(([k, v]) => console.log(`  ${k}: ${v.band}${v.score !== null ? ` (${v.score})` : ''}`));
  console.log(`Overall Fit: ${analysis.match.overallFit.band}${analysis.match.overallFit.score !== null ? ` (${analysis.match.overallFit.score})` : ''}`);
  console.log(`Readiness gap: ${analysis.match.readinessGapBand}`);
  console.log(`\nRecommendation: ${analysis.recommendation.action} (confidence: ${analysis.recommendation.confidence}, urgency: ${analysis.recommendation.urgency}, days remaining: ${analysis.recommendation.daysRemaining})`);
  analysis.recommendation.reasons.forEach((r) => console.log(`  - ${r}`));

  section('3. OPPORTUNITY BRIEF (the first screen)');
  console.log(opportunityService.buildOpportunityBrief(opportunity.id, DEMO_STUDENT_ID));

  section('4. GAP ANALYSIS - TARGET GAP VS OPPORTUNITY GAP (spec section 22)');
  console.log('Target gaps (general prep for Software Developer):', analysis.gaps.targetGaps.map((g) => g.label));
  console.log('Opportunity gaps (specific to this posting):', analysis.gaps.opportunityGaps.map((g) => g.label));
  console.log('Preferred (nice-to-have, never "required"):', analysis.gaps.preferred.map((p) => `${p.label} (${p.note})`));

  section('5. ACTION PLAN (minimum effective preparation, spec section 33)');
  const plan = await opportunityService.planActionForStudent(opportunity.id, DEMO_STUDENT_ID);
  plan.items.forEach((i) => console.log(`  ${i.order}. [${i.type}] ${i.title} (~${i.estMinutes} min)`));
  console.log(`Total: ~${plan.totalEstMinutes} min against a budget of ~${plan.budgetMinutes} min`);

  section('6. SIMULATION (Feature 31 integration seam)');
  console.log('Simulation available:', simulationService.isAvailable(), '- expected false: no existing Feature 31 service was available to connect to in this build.');

  section('7. APPLY + TRACK APPLICATION (validated state machine)');
  applicationService.updateApplicationStatus(opportunity.id, DEMO_STUDENT_ID, 'REVIEWED');
  applicationService.updateApplicationStatus(opportunity.id, DEMO_STUDENT_ID, 'ELIGIBILITY_CHECKED');
  applicationService.updateApplicationStatus(opportunity.id, DEMO_STUDENT_ID, 'READY');
  const applied = applicationService.updateApplicationStatus(opportunity.id, DEMO_STUDENT_ID, 'APPLIED');
  console.log('Application status:', applied.application.status);
  const rejectedJump = applicationService.updateApplicationStatus(opportunity.id, DEMO_STUDENT_ID, 'FINAL_STAGE');
  console.log('Attempted invalid jump APPLIED -> FINAL_STAGE:', rejectedJump.error ? `blocked (${rejectedJump.error})` : 'ERROR: should have been blocked');
  applicationService.updateApplicationStatus(opportunity.id, DEMO_STUDENT_ID, 'ASSESSMENT');

  section('8. RECORD OUTCOME + PATTERN DETECTION (needs >=2 data points, spec section 49)');
  const outcome1 = await outcomeService.recordOutcome(DEMO_STUDENT_ID, {
    opportunityId: opportunity.id, stageReached: 'assessment', outcome: 'rejected', skillTag: 'timed_technical_application',
  });
  console.log('Outcome 1 recorded. Bottlenecks flagged so far:', outcome1.patterns.bottlenecks.length, '(expected 0 - only one data point)');

  const { opportunity: opportunity2 } = await opportunityService.ingestOpportunity({
    title: 'Software Engineer Intern',
    organization: 'Alta Systems',
    opportunityType: 'internship',
    requirements: 'Python, Data Structures',
    eligibility: 'Final year students.',
    deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    targetId: 'target_software_developer',
  }, { aiProvider });
  await opportunityService.analyzeOpportunityForStudent(opportunity2.id, DEMO_STUDENT_ID, { aiProvider });
  ['REVIEWED', 'ELIGIBILITY_CHECKED', 'READY', 'APPLIED', 'ASSESSMENT'].forEach(
    (status) => applicationService.updateApplicationStatus(opportunity2.id, DEMO_STUDENT_ID, status),
  );
  const outcome2 = await outcomeService.recordOutcome(DEMO_STUDENT_ID, {
    opportunityId: opportunity2.id, stageReached: 'assessment', outcome: 'rejected', skillTag: 'timed_technical_application',
  });
  console.log('Outcome 2 recorded (different opportunity, same failure point). Bottlenecks now:', outcome2.patterns.bottlenecks.length);
  outcome2.patterns.bottlenecks.forEach((b) => console.log(`  - ${b.message} (confidence: ${b.confidence})`));

  section('9. OPPORTUNITY JOURNEY (spec section 48 - only real stored counts)');
  console.log(outcomeService.getJourney(DEMO_STUDENT_ID).counts);

  section('10. MY OPPORTUNITIES - PRIORITY QUEUE (spec sections 26-27)');
  const queue = opportunityService.priorityQueueForStudent(DEMO_STUDENT_ID);
  Object.entries(queue).forEach(([tier, list]) => {
    console.log(`${tier}:`, list.map((r) => `${r.opportunity.title} (${r.analysis.match.overallFit.band} fit, ${r.analysis.recommendation.urgency} deadline)`));
  });

  console.log('\nDone - full OPPORTUNITY -> ACTION -> OUTCOME -> LEARNING loop executed end-to-end.');
}

main().catch((err) => { console.error(err); process.exit(1); });
