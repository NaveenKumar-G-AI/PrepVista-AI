// Automated tests for the deterministic core -- the logic that must stay
// correct and explainable regardless of whether AI enhancement is enabled.
// Run with: npm test  (uses Node's built-in test runner, no extra dependency)

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseDeterministic } = require('../src/services/jdParser');
const { matchRequirementsToEvidence } = require('../src/services/matchingEngine');
const { computePriority } = require('../src/services/priorityEngine');
const { checkOpportunitySafety } = require('../src/services/safetyChecker');
const { checkClaimSafety } = require('../src/services/applicationContentService');

test('jdParser: extracts must-have vs preferred requirements with skill keys', () => {
  const jd = `Backend Developer

Requirements:
- Strong programming ability in Python
- Experience with REST APIs

Preferred:
- Familiarity with Docker

Location: Remote`;

  const parsed = parseDeterministic(jd);
  const pythonReq = parsed.requirements.find((r) => r.skill_key === 'Python');
  const dockerReq = parsed.requirements.find((r) => r.skill_key === 'Docker');

  assert.ok(pythonReq, 'Python should be extracted as a requirement');
  assert.equal(pythonReq.category, 'MUST_HAVE');
  assert.equal(pythonReq.priority, 'CRITICAL');
  assert.ok(dockerReq, 'Docker should be extracted as a requirement');
  assert.equal(dockerReq.category, 'PREFERRED');
  assert.equal(parsed.work_mode_guess, 'REMOTE');
});

test('matchingEngine: never treats self-declared evidence as a strong match (spec section 16)', () => {
  const requirements = [{ id: 'r1', req_type: 'SKILL', skill_key: 'Python', priority: 'CRITICAL' }];
  const evidence = [{ id: 'e1', skill: 'Python', evidence_type: 'SELF_DECLARED', strength: 'STRONG' }];

  const [match] = matchRequirementsToEvidence(requirements, evidence);
  assert.equal(match.match_status, 'PARTIAL_MATCH', 'self-declared evidence must be capped below STRONG_MATCH even if strength says STRONG');
});

test('matchingEngine: no evidence at all is a GAP, not an assumption', () => {
  const requirements = [{ id: 'r1', req_type: 'SKILL', skill_key: 'Kubernetes', priority: 'CRITICAL' }];
  const [match] = matchRequirementsToEvidence(requirements, []);
  assert.equal(match.match_status, 'GAP');
});

test('matchingEngine: validated project evidence produces a strong match', () => {
  const requirements = [{ id: 'r1', req_type: 'SKILL', skill_key: 'Python', priority: 'CRITICAL' }];
  const evidence = [{ id: 'e1', skill: 'Python', evidence_type: 'PROJECT', strength: 'STRONG' }];
  const [match] = matchRequirementsToEvidence(requirements, evidence);
  assert.equal(match.match_status, 'STRONG_MATCH');
});

test('priorityEngine: a HIGH safety concern always forces VERIFY_FIRST, even with a strong fit score', () => {
  const dimensions = {
    career_alignment: 100, career_alignment_band: 'STRONG', capability_fit: 100, evidence_fit: 100,
    project_relevance: 100, application_effort: 'QUICK',
  };
  const result = computePriority({
    dimensions,
    safety: { concern_level: 'HIGH', signals: [] },
    matches: [],
    requirements: [],
  });
  assert.equal(result.priority_recommendation, 'VERIFY_FIRST');
});

test('priorityEngine: low value score with no gaps still does not exceed LOW_PRIORITY', () => {
  const dimensions = { career_alignment: 10, capability_fit: 10, evidence_fit: 10, project_relevance: 0, application_effort: 'STANDARD' };
  const result = computePriority({ dimensions, safety: { concern_level: 'LOW' }, matches: [], requirements: [] });
  assert.ok(['LOW_PRIORITY', 'DO_NOT_PRIORITIZE'].includes(result.priority_recommendation));
});

test('safetyChecker: flags an upfront-fee posting as HIGH concern', () => {
  const result = checkOpportunitySafety({
    raw_jd_text: 'A refundable registration fee of ₹500 is required before onboarding.',
    company: 'QuickHire Global',
    source_type: 'UNKNOWN',
  });
  assert.equal(result.concern_level, 'HIGH');
  assert.ok(result.signals.some((s) => s.severity === 'HIGH'));
});

test('safetyChecker: a clean, officially-sourced posting is LOW concern', () => {
  const result = checkOpportunitySafety({
    raw_jd_text: 'We are hiring a Backend Developer to build our core API platform.',
    company: 'Company X',
    source_type: 'OFFICIAL_COMPANY_SOURCE',
  });
  assert.equal(result.concern_level, 'LOW');
});

test('applicationContentService: flags a scale claim not traceable to recorded evidence', () => {
  const evidence = [{ skill: 'Python', description: 'Built backend logic for a course project' }];
  const flagged = checkClaimSafety('I built a system that served 50000 users.', evidence);
  assert.equal(flagged.length, 1);
});

test('applicationContentService: does not flag a claim actually grounded in evidence', () => {
  const evidence = [{ skill: 'Python', description: 'API handled 50000 requests during load testing' }];
  const flagged = checkClaimSafety('The API served 50000 requests reliably.', evidence);
  assert.equal(flagged.length, 0);
});

test('applicationContentService: does not flag plain, non-quantified claims', () => {
  const evidence = [{ skill: 'Python', description: 'Built backend logic' }];
  const flagged = checkClaimSafety('I built the backend logic for a project using Python.', evidence);
  assert.equal(flagged.length, 0);
});
