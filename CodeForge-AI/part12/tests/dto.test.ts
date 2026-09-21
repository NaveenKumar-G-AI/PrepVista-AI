import { test, run, assert } from './testHarness.js';
import {
  canViewSubmission,
  canViewAdminDebugInfo,
  canInitiateReevaluation,
  assertCanView,
  toSubmissionDetailDTO,
  type ViewerRelationship,
} from '../src/services/dto.js';
import { ForbiddenError } from '../src/repository/submissionRepository.js';
import type { AuthenticatedActor, EvaluationResult, Submission } from '../src/domain/types.js';

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    attemptId: 'attempt-1',
    userId: 'student-1',
    problemId: 'problem-1',
    assessmentId: null,
    mode: 'PRACTICE',
    problemVersionId: 'pv-1',
    testSuiteVersionId: 'tv-1',
    checkerVersionId: 'cv-1',
    executionConfigSnapshot: { cpuTimeLimitMs: 1000, wallTimeLimitMs: 2000, memoryLimitKb: 65536, outputLimitBytes: 4096, processLimit: 8, networkAllowed: false },
    language: 'python',
    languageVersion: '3.12',
    sourceFingerprint: 'abc',
    totalSourceBytes: 10,
    fileCount: 1,
    status: 'COMPLETED',
    currentEvaluationResultId: 'result-1',
    idempotencyKey: 'idem-1',
    submissionNumber: 1,
    serverReceivedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const noRelationship: ViewerRelationship = { isProblemAuthor: false, isInterviewerForAttempt: false };

test('the owner can always view their own submission', () => {
  const viewer: AuthenticatedActor = { userId: 'student-1', role: 'student' };
  assert.equal(canViewSubmission(viewer, makeSubmission({ userId: 'student-1' }), noRelationship), true);
});

test("a different student cannot view someone else's submission", () => {
  const viewer: AuthenticatedActor = { userId: 'student-2', role: 'student' };
  assert.equal(canViewSubmission(viewer, makeSubmission({ userId: 'student-1' }), noRelationship), false);
  assert.throws(() => assertCanView(viewer, makeSubmission({ userId: 'student-1' }), noRelationship), ForbiddenError);
});

test('instructor, admin, and problem_author roles can view any submission', () => {
  const submission = makeSubmission({ userId: 'student-1' });
  for (const role of ['instructor', 'admin', 'problem_author'] as const) {
    const viewer: AuthenticatedActor = { userId: 'staff-1', role };
    assert.equal(canViewSubmission(viewer, submission, noRelationship), true, `${role} should be able to view`);
  }
});

test('problem_author flag grants access even without the literal problem_author role (e.g. a co-author)', () => {
  const viewer: AuthenticatedActor = { userId: 'coauthor-1', role: 'student' };
  const rel: ViewerRelationship = { isProblemAuthor: true, isInterviewerForAttempt: false };
  assert.equal(canViewSubmission(viewer, makeSubmission(), rel), true);
});

test('interviewer can view ONLY when actually assigned to this attempt, not by role alone', () => {
  const viewer: AuthenticatedActor = { userId: 'interviewer-1', role: 'interviewer' };
  assert.equal(canViewSubmission(viewer, makeSubmission(), noRelationship), false, 'unassigned interviewer must NOT see it');
  const assigned: ViewerRelationship = { isProblemAuthor: false, isInterviewerForAttempt: true };
  assert.equal(canViewSubmission(viewer, makeSubmission(), assigned), true, 'assigned interviewer should see it');
});

test('admin debug info is strictly narrower than general view access — instructor and interviewer are excluded', () => {
  assert.equal(canViewAdminDebugInfo({ userId: 'x', role: 'admin' }, noRelationship), true);
  assert.equal(canViewAdminDebugInfo({ userId: 'x', role: 'instructor' }, noRelationship), false);
  assert.equal(canViewAdminDebugInfo({ userId: 'x', role: 'interviewer' }, { isProblemAuthor: false, isInterviewerForAttempt: true }), false);
  assert.equal(canViewAdminDebugInfo({ userId: 'x', role: 'student' }, { isProblemAuthor: true, isInterviewerForAttempt: false }), true, 'problem_author flag still qualifies');
});

test("re-evaluation authorization matches the DB function's role set exactly", () => {
  assert.equal(canInitiateReevaluation({ userId: 'x', role: 'admin' }), true);
  assert.equal(canInitiateReevaluation({ userId: 'x', role: 'instructor' }), true);
  assert.equal(canInitiateReevaluation({ userId: 'x', role: 'problem_author' }), true);
  assert.equal(canInitiateReevaluation({ userId: 'x', role: 'student' }), false);
  assert.equal(canInitiateReevaluation({ userId: 'x', role: 'interviewer' }), false);
});

test('an in-flight submission (no official result yet) never fabricates a result object', () => {
  const dto = toSubmissionDetailDTO(makeSubmission({ status: 'RUNNING', currentEvaluationResultId: null }), [], null, []);
  assert.equal(dto.result, null);
});

test('LEAKAGE: hidden-result fields are reconstructed field-by-field, so contamination from upstream cannot pass through', () => {
  const contaminatedResult = {
    id: 'result-1',
    evaluationJobId: 'job-1',
    submissionId: 'sub-1',
    compilationStatus: 'SUCCESS',
    compilationOutput: null,
    publicResult: { totalTests: 2, passed: 2, failed: 0, cases: [] },
    hiddenResult: {
      totalGroups: 4,
      passedGroups: 4,
      totalWeight: 100,
      earnedWeight: 100,
      // Simulating a hypothetical upstream bug that attached forbidden fields —
      // bypassing the type system on purpose here, exactly like a real leak would have to.
      rawExpectedOutput: 'THE_SECRET_EXPECTED_OUTPUT',
      hiddenTestIds: ['secret-id-1', 'secret-id-2'],
      checkerSource: 'def check(...): ...SECRET...',
    },
    resourceUsage: { cpuMs: 10, memoryKb: 100, wallMs: 12, outputBytes: 4 },
    verdict: 'ACCEPTED',
    score: 100,
    terminationReason: null,
    isOfficial: true,
    finalizedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  } as unknown as EvaluationResult;

  const dto = toSubmissionDetailDTO(makeSubmission(), [], contaminatedResult, []);
  const serialized = JSON.stringify(dto);

  assert.ok(!serialized.includes('THE_SECRET_EXPECTED_OUTPUT'), 'raw expected output must never reach the client');
  assert.ok(!serialized.includes('secret-id-1'), 'hidden test IDs must never reach the client');
  assert.ok(!serialized.includes('checkerSource') && !serialized.includes('SECRET'), 'checker source must never reach the client');
  assert.deepEqual(Object.keys(dto.result!.hiddenResult).sort(), ['earnedWeight', 'passedGroups', 'totalGroups', 'totalWeight']);
});

await run('dto.test.ts');
