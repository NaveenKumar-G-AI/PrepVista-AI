// Demo-verification suite — same pattern used for CodeForge's diagnostic
// and PrepVista's Part 8/16: zero-dependency, run directly with `node`,
// exercised against named fixture scenarios rather than one happy path.
//
//     node tests/demo.test.mjs
//
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { scoreSubmission, validateRubric, RubricValidationError } from '../src/engine/rubricEngine.js';
import { evaluateSubmission } from '../src/engine/evaluationEngine.js';
import { deriveEvidence } from '../src/engine/evidenceEngine.js';
import { computeImprovementDelta, recordRevision } from '../src/engine/revisionEngine.js';
import { validateProjectDefinition, runQualityGate, ProjectValidationError } from '../src/validation/projectSchema.js';
import { mockRunTests, mockRunSecurityChecks } from '../src/engine/executionAdapter.js';
import { validateAIReviewResponse, sanitizeAIReviewResponse } from '../src/ai/aiContract.js';
import { reviewSubmission, reviewSubmissionWithHallucination, DEMO_SUBMISSION_FILES } from '../src/ai/demoAIReviewer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleProject = JSON.parse(
  readFileSync(path.join(__dirname, '../src/seed/sample-project.notification-service.json'), 'utf-8')
);

let passCount = 0;
let failCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok   - ${name}`);
    passCount++;
  } catch (e) {
    console.error(`  FAIL - ${name}`);
    console.error(`         ${e.message}`);
    failCount++;
    process.exitCode = 1;
  }
}
async function atest(name, fn) {
  try {
    await fn();
    console.log(`  ok   - ${name}`);
    passCount++;
  } catch (e) {
    console.error(`  FAIL - ${name}`);
    console.error(`         ${e.message}`);
    failCount++;
    process.exitCode = 1;
  }
}

console.log('\n[rubricEngine]');
test('weighted score across fully-scored categories', () => {
  const rubric = { id: 'r1', categories: [{ key: 'a', label: 'A', weight: 60 }, { key: 'b', label: 'B', weight: 40 }] };
  assert.equal(scoreSubmission(rubric, { a: 80, b: 50 }).totalScore, 68);
});
test('rejects a rubric whose weights do not sum to 100', () => {
  assert.throws(() => validateRubric({ categories: [{ key: 'a', weight: 50 }] }), RubricValidationError);
});
test('clamps out-of-range raw scores into 0-100', () => {
  const rubric = { id: 'r2', categories: [{ key: 'x', label: 'X', weight: 100 }] };
  assert.equal(scoreSubmission(rubric, { x: 150 }).totalScore, 100);
});
test('missing categories are renormalized around, never zero-filled', () => {
  const rubric = { id: 'r3', categories: [{ key: 'a', label: 'A', weight: 50 }, { key: 'b', label: 'B', weight: 50 }] };
  const result = scoreSubmission(rubric, { a: 80 }); // b never scored
  assert.deepEqual(result.missingCategories, ['b']);
  assert.equal(result.totalScore, 80); // a's weight renormalized to 100%, not diluted to 40
  assert.equal(result.fullyAssessed, false);
});

console.log('\n[projectSchema]');
test('sample project definition is schema-valid', () => {
  assert.doesNotThrow(() => validateProjectDefinition(sampleProject));
});
test('rejects a project with no hidden acceptance criteria (Phase 15)', () => {
  const bad = { ...sampleProject, acceptanceCriteria: sampleProject.acceptanceCriteria.filter((c) => c.testType !== 'hidden') };
  assert.throws(() => validateProjectDefinition(bad), ProjectValidationError);
});
test('publish quality gate passes for the sample project + its rubric', () => {
  const result = runQualityGate(sampleProject, sampleProject.rubric);
  assert.equal(result.passed, true, JSON.stringify(result.errors));
});

console.log('\n[evaluationEngine — Phase 68 fixture scenarios]');

async function evaluate(claimedIds, aiReview, files) {
  return evaluateSubmission({
    submission: { testResultsClaimed: claimedIds, files: files ?? {} },
    project: sampleProject,
    rubric: sampleProject.rubric,
    deps: { runTests: mockRunTests, runSecurityChecks: mockRunSecurityChecks, aiReview },
  });
}

const allCriteriaIds = sampleProject.acceptanceCriteria.map((c) => c.id);
const visibleOnlyIds = sampleProject.acceptanceCriteria.filter((c) => c.testType === 'visible').map((c) => c.id);

let incompleteEval, visibleOnlyEval, aiUnavailableEval, aiAvailableEval;

await atest('fixture: incomplete submission fails with an accurate evaluation', async () => {
  incompleteEval = await evaluate([]);
  assert.equal(incompleteEval.passed, false);
  assert.ok(incompleteEval.feedback.length > 0);
});

await atest('fixture: passes visible tests but fails hidden tests -> not fully passed', async () => {
  visibleOnlyEval = await evaluate(visibleOnlyIds);
  assert.equal(visibleOnlyEval.passed, false);
  assert.equal(visibleOnlyEval.testResult.hiddenPassed, 0);
});

await atest('fixture: AI unavailable -> deterministic-only evaluation still completes', async () => {
  aiUnavailableEval = await evaluate(allCriteriaIds, undefined);
  assert.equal(aiUnavailableEval.aiAvailable, false);
  assert.equal(aiUnavailableEval.passed, true); // hidden tests all met + deterministic categories score 100
  assert.equal(aiUnavailableEval.fullyAssessed, false);
  assert.deepEqual(aiUnavailableEval.missingCategories.sort(), ['architecture', 'code_quality', 'documentation'].sort());
});

await atest('fixture: AI available (demo reviewer) -> full qualitative evidence included', async () => {
  aiAvailableEval = await evaluate(
    allCriteriaIds,
    (submission, project) => reviewSubmission(project, submission.files),
    DEMO_SUBMISSION_FILES
  );
  assert.equal(aiAvailableEval.aiAvailable, true);
  assert.equal(aiAvailableEval.fullyAssessed, true);
  assert.equal(aiAvailableEval.missingCategories.length, 0);
  // the demo review is deliberately imperfect (58/66/40) — this proves those
  // scores actually pull the total down instead of being ignored
  assert.ok(aiAvailableEval.totalScore < aiUnavailableEval.totalScore);
});

await atest('fixture: evaluateSubmission strips a hallucinated AI reference before it reaches the student', async () => {
  const evalWithHallucination = await evaluate(
    allCriteriaIds,
    (submission, project) => reviewSubmissionWithHallucination(project, submission.files),
    DEMO_SUBMISSION_FILES
  );
  assert.equal(evalWithHallucination.feedback.some((f) => f.evidenceRef?.includes('config/secrets.yaml')), false);
});

console.log('\n[aiContract — anti-hallucination grounding check]');
await atest('a clean demo review validates and is fully grounded', async () => {
  const review = await reviewSubmission(sampleProject, DEMO_SUBMISSION_FILES);
  const result = validateAIReviewResponse(review, DEMO_SUBMISSION_FILES);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
await atest('a hallucinated file reference fails validation and is stripped by sanitize', async () => {
  const poisoned = await reviewSubmissionWithHallucination(sampleProject, DEMO_SUBMISSION_FILES);
  const check = validateAIReviewResponse(poisoned, DEMO_SUBMISSION_FILES);
  assert.equal(check.valid, false); // the raw response correctly fails validation...
  const sanitized = sanitizeAIReviewResponse(poisoned, DEMO_SUBMISSION_FILES);
  assert.equal(sanitized.feedback.some((f) => f.evidenceRef?.includes('config/secrets.yaml')), false);
  assert.equal(sanitized.feedback.length, poisoned.feedback.length - 1); // ...and only that item is dropped
});

console.log('\n[evidenceEngine + revisionEngine]');
test('evidence is only emitted for categories actually assessed (AI-unavailable case)', () => {
  const evidence = deriveEvidence({ sessionId: 's1', studentId: 'u1', submissionId: 'sub1' }, aiUnavailableEval.breakdown, sampleProject.skills);
  assert.ok(!evidence.some((e) => e.skillTag === 'architecture')); // never assessed without AI — no fabricated evidence
  assert.equal(evidence.length, aiUnavailableEval.breakdown.length + sampleProject.skills.length);
});
test('evidence includes qualitative categories once AI review is available', () => {
  const evidence = deriveEvidence({ sessionId: 's1', studentId: 'u1', submissionId: 'sub2' }, aiAvailableEval.breakdown, sampleProject.skills);
  assert.ok(evidence.some((e) => e.skillTag === 'architecture'));
});
test('improvement delta is positive after a revision that closes the gap (Phase 38)', () => {
  const delta = computeImprovementDelta(visibleOnlyEval, aiUnavailableEval);
  assert.ok(delta.totalScoreDelta > 0);
});
test('revision links two submissions', () => {
  const rev = recordRevision({ sessionId: 's1', fromSubmissionId: 'sub1', toSubmissionId: 'sub2', addressedFeedbackIds: ['f1'] });
  assert.equal(rev.fromSubmissionId, 'sub1');
  assert.equal(rev.toSubmissionId, 'sub2');
});

console.log(`\n${passCount} passing, ${failCount} failing\n`);
