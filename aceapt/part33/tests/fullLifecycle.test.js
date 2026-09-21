'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { seedDemoData, DEMO_STUDENT_ID } = require('../src/seed/demoData');
const opportunityService = require('../src/services/opportunityService');
const applicationService = require('../src/services/applicationService');
const outcomeService = require('../src/services/outcomeService');
const { analyzeEligibility } = require('../src/engines/eligibilityEngine');
const { recommend, ACTIONS } = require('../src/engines/recommendationEngine');
const { canTransition } = require('../src/engines/applicationStateMachine');

test('eligibility engine never assumes on missing data (spec section 13)', () => {
  const result = analyzeEligibility({
    eligibilityText: "Bachelor's degree required.",
    student: { graduationStatus: null },
  });
  assert.equal(result.state, 'UNCERTAIN');
});

test('eligibility fails clearly on a stated mismatch, not silently', () => {
  const result = analyzeEligibility({
    eligibilityText: '3+ years of experience required.',
    student: { experienceYears: 0 },
  });
  assert.equal(result.state, 'NOT_ELIGIBLE');
});

test('eligibility does not mistake "degree in Computer Science" for a location constraint', () => {
  const result = analyzeEligibility({
    eligibilityText: 'Final year students or recent graduates in Computer Science required.',
    student: { graduationStatus: 'final_year', experienceYears: 0, locationPref: 'Remote' },
  });
  assert.equal(result.state, 'ELIGIBLE');
  assert.ok(!result.checks.some((c) => c.type === 'location'));
});

test('full ingest -> analyze -> brief -> action plan pipeline runs without fabrication', async () => {
  const { opportunity } = await seedDemoData({});
  const { analysis } = await opportunityService.analyzeOpportunityForStudent(opportunity.id, DEMO_STUDENT_ID, {});

  assert.ok(['ELIGIBLE', 'LIKELY_ELIGIBLE', 'UNCERTAIN', 'NOT_ELIGIBLE'].includes(analysis.eligibility.state));
  assert.ok(analysis.match.overallFit.band);
  assert.ok(Array.isArray(analysis.recommendation.reasons) && analysis.recommendation.reasons.length > 0);

  // Spec section 22: target gap vs opportunity gap must both be demonstrable from real data.
  assert.ok(analysis.gaps.targetGaps.length > 0, 'expected at least one target gap in the demo profile');
  assert.ok(analysis.gaps.opportunityGaps.length > 0, 'expected at least one opportunity-specific gap (FastAPI) in the demo profile');

  const brief = opportunityService.buildOpportunityBrief(opportunity.id, DEMO_STUDENT_ID);
  assert.equal(brief.title, opportunity.title);

  const plan = await opportunityService.planActionForStudent(opportunity.id, DEMO_STUDENT_ID);
  assert.ok(plan.items.length > 0);
  assert.equal(plan.items[plan.items.length - 1].type, 'apply');
});

test('recommendation matrix: eligible + no gap => APPLY_NOW regardless of deadline', () => {
  const result = recommend({
    eligibility: { state: 'ELIGIBLE', reasons: [] },
    overallFit: { score: 95, band: 'Strong' },
    readinessGapBand: 'None',
    deadlineIso: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    gaps: { opportunityGaps: [] },
  });
  assert.equal(result.action, ACTIONS.APPLY_NOW);
});

test('recommendation matrix: not eligible always overrides fit', () => {
  const result = recommend({
    eligibility: { state: 'NOT_ELIGIBLE', reasons: ['test'] },
    overallFit: { score: 95, band: 'Strong' },
    readinessGapBand: 'None',
    deadlineIso: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    gaps: { opportunityGaps: [] },
  });
  assert.equal(result.action, ACTIONS.NOT_RECOMMENDED);
});

test('recommendation matrix: uncertain eligibility asks to verify rather than guessing', () => {
  const result = recommend({
    eligibility: { state: 'UNCERTAIN', reasons: ['degree status unknown'] },
    overallFit: { score: 90, band: 'Strong' },
    readinessGapBand: 'None',
    deadlineIso: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    gaps: { opportunityGaps: [] },
  });
  assert.equal(result.action, ACTIONS.VERIFY_ELIGIBILITY);
});

test('application state machine blocks nonsensical jumps', () => {
  assert.equal(canTransition('DISCOVERED', 'INTERVIEW'), false);
  assert.equal(canTransition('DISCOVERED', 'REVIEWED'), true);
  assert.equal(canTransition('APPLIED', 'ASSESSMENT'), true);
});

test('application service rejects an invalid transition with a clear error, not a silent no-op', () => {
  const result = applicationService.updateApplicationStatus('opp_test_state', 'student_test_state', 'INTERVIEW');
  assert.equal(result.error, 'INVALID_TRANSITION');
});

test('outcome pattern detection requires at least 2 occurrences before flagging a bottleneck', async () => {
  const studentId = `student_pattern_test_${Date.now()}`;
  const first = await outcomeService.recordOutcome(studentId, {
    opportunityId: 'opp_a', stageReached: 'assessment', outcome: 'rejected', skillTag: 'timed_technical_application',
  });
  assert.equal(first.patterns.bottlenecks.length, 0);

  const second = await outcomeService.recordOutcome(studentId, {
    opportunityId: 'opp_b', stageReached: 'assessment', outcome: 'rejected', skillTag: 'timed_technical_application',
  });
  assert.equal(second.patterns.bottlenecks.length, 1);
  assert.equal(second.patterns.bottlenecks[0].confidence, 'LOW'); // only 2 data points - never overclaim
});
