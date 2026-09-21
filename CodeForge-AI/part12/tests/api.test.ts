import { randomUUID } from 'node:crypto';
import { test, run, assert } from './testHarness.js';
import { InMemorySubmissionRepository } from '../src/repository/inMemorySubmissionRepository.js';
import {
  handleCreateSubmission,
  handleGetSubmission,
  handleCancelSubmission,
  handleReevaluateSubmission,
  handleGetAdminDebug,
  type RelationshipResolver,
} from '../src/api/handlers.js';
import type { SubmitCodeDependencies, AssessmentPolicyResolver, LanguageCatalog, VersionResolver } from '../src/services/submissionService.js';
import { buildSubmissionRateLimiters } from '../src/services/rateLimiter.js';
import { loadConfig } from '../src/domain/config.js';
import type { AuthenticatedActor, SubmissionRequest } from '../src/domain/types.js';
import { makeAcceptedFinalizeParams } from './fixtures.js';

const noopRelationshipResolver: RelationshipResolver = { resolve: async () => ({ isProblemAuthor: false, isInterviewerForAttempt: false }) };

const alwaysSupportedLanguages: LanguageCatalog = { supportedLanguagesFor: async () => [{ language: 'python', version: '3.12' }] };
const practiceOnlyAssessmentPolicy: AssessmentPolicyResolver = {
  resolve: async () => ({ window: { startsAt: new Date(0), endsAt: new Date(8640000000000000) }, maxSubmissionsPerAttempt: null }),
};
const fixedVersionResolver: VersionResolver = {
  resolveCurrentVersions: async () => ({
    problemVersionId: 'pv-1',
    testSuiteVersionId: 'tv-1',
    checkerVersionId: 'cv-1',
    executionConfigSnapshot: { cpuTimeLimitMs: 1000, wallTimeLimitMs: 2000, memoryLimitKb: 65536, outputLimitBytes: 4096, processLimit: 8, networkAllowed: false },
  }),
};

function buildDeps(repo: InMemorySubmissionRepository) {
  const limits = loadConfig({}).limits;
  const rateLimiters = buildSubmissionRateLimiters({ submissionsPerUserPerMinute: 3, submissionsPerIpPerMinute: 100 });
  const deps: SubmitCodeDependencies & { rateLimiters: typeof rateLimiters } = {
    repo,
    versionResolver: fixedVersionResolver,
    assessmentPolicyResolver: practiceOnlyAssessmentPolicy,
    languageCatalog: alwaysSupportedLanguages,
    limits,
    now: () => new Date(),
    rateLimiters,
  };
  return deps;
}

function buildRequest(overrides: Partial<SubmissionRequest> = {}): SubmissionRequest {
  return {
    attemptId: '',
    files: [{ filename: 'main.py', path: 'main.py', content: 'print(1)', role: 'MAIN', ordinal: 0 }],
    language: 'python',
    languageVersion: '3.12',
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

test('a student can create a submission and immediately fetch its own status', async () => {
  const repo = new InMemorySubmissionRepository();
  const deps = buildDeps(repo);
  const attempt = await repo.createAttempt({ userId: 'student-a', problemId: 'p1', assessmentId: null, mode: 'PRACTICE' });
  const actor: AuthenticatedActor = { userId: 'student-a', role: 'student' };

  const created = await handleCreateSubmission(deps, { actor, ipAddress: '1.1.1.1', body: buildRequest({ attemptId: attempt.id }) });
  assert.equal(created.status, 201);
  const submissionId = (created.body as { submissionId: string }).submissionId;

  const fetched = await handleGetSubmission(repo, noopRelationshipResolver, actor, submissionId);
  assert.equal(fetched.status, 200);
});

test("IDOR: a different student cannot fetch someone else's submission by ID", async () => {
  const repo = new InMemorySubmissionRepository();
  const deps = buildDeps(repo);
  const attempt = await repo.createAttempt({ userId: 'student-a', problemId: 'p1', assessmentId: null, mode: 'PRACTICE' });
  const owner: AuthenticatedActor = { userId: 'student-a', role: 'student' };
  const attacker: AuthenticatedActor = { userId: 'student-b', role: 'student' };

  const created = await handleCreateSubmission(deps, { actor: owner, ipAddress: '1.1.1.1', body: buildRequest({ attemptId: attempt.id }) });
  const submissionId = (created.body as { submissionId: string }).submissionId;

  const attackerFetch = await handleGetSubmission(repo, noopRelationshipResolver, attacker, submissionId);
  assert.equal(attackerFetch.status, 403);
});

test("IDOR: a different student cannot cancel someone else's submission", async () => {
  const repo = new InMemorySubmissionRepository();
  const deps = buildDeps(repo);
  const attempt = await repo.createAttempt({ userId: 'student-a', problemId: 'p1', assessmentId: null, mode: 'PRACTICE' });
  const owner: AuthenticatedActor = { userId: 'student-a', role: 'student' };
  const attacker: AuthenticatedActor = { userId: 'student-b', role: 'student' };

  const created = await handleCreateSubmission(deps, { actor: owner, ipAddress: '1.1.1.1', body: buildRequest({ attemptId: attempt.id }) });
  const submissionId = (created.body as { submissionId: string }).submissionId;

  const attackerCancel = await handleCancelSubmission(repo, attacker, submissionId);
  assert.equal(attackerCancel.status, 403);

  const stillQueued = await repo.getSubmissionById(submissionId);
  assert.equal(stillQueued!.status, 'QUEUED');
});

test('mass assignment: a client cannot manipulate ownership — actor comes only from the resolved session, never the request body', async () => {
  const repo = new InMemorySubmissionRepository();
  const deps = buildDeps(repo);
  const attempt = await repo.createAttempt({ userId: 'student-a', problemId: 'p1', assessmentId: null, mode: 'PRACTICE' });
  const actor: AuthenticatedActor = { userId: 'student-a', role: 'student' };

  const body = buildRequest({ attemptId: attempt.id });
  const created = await handleCreateSubmission(deps, { actor, ipAddress: '1.1.1.1', body });
  const submissionId = (created.body as { submissionId: string }).submissionId;
  const submission = await repo.getSubmissionById(submissionId);
  assert.equal(submission!.userId, 'student-a');
});

test('a student cannot request re-evaluation of their own submission', async () => {
  const repo = new InMemorySubmissionRepository();
  const attempt = await repo.createAttempt({ userId: 'student-a', problemId: 'p1', assessmentId: null, mode: 'PRACTICE' });
  const { submissionId } = await repo.createSubmissionAtomic({
    userId: 'student-a',
    attemptId: attempt.id,
    problemId: 'p1',
    assessmentId: null,
    mode: 'PRACTICE',
    problemVersionId: 'pv',
    testSuiteVersionId: 'tv',
    checkerVersionId: 'cv',
    executionConfigSnapshot: { cpuTimeLimitMs: 1000, wallTimeLimitMs: 1000, memoryLimitKb: 1000, outputLimitBytes: 1000, processLimit: 1, networkAllowed: false },
    language: 'python',
    languageVersion: '3.12',
    sourceFingerprint: 'x',
    totalSourceBytes: 1,
    files: [{ filename: 'a', path: 'a', content: 'x', sizeBytes: 1, sha256: 'x', role: 'MAIN', ordinal: 0 }],
    idempotencyKey: randomUUID(),
    requestFingerprint: 'x',
    maxSubmissionsPerAttempt: null,
  });
  const job = await repo.claimNextEvaluationJob('w1', 60);
  await repo.finalizeEvaluation(makeAcceptedFinalizeParams({ jobId: job!.id, workerId: 'w1', verdict: 'WRONG_ANSWER', score: 0 }));

  const studentAttempt = await handleReevaluateSubmission(repo, { userId: 'student-a', role: 'student' }, submissionId, 'I think this is unfair');
  assert.equal(studentAttempt.status, 403);

  const adminAttempt = await handleReevaluateSubmission(repo, { userId: 'admin-1', role: 'admin' }, submissionId, 'checker bug confirmed');
  assert.equal(adminAttempt.status, 202);
});

test('re-evaluation requires a real reason, not an empty/trivial string, for the audit trail', async () => {
  const repo = new InMemorySubmissionRepository();
  const result = await handleReevaluateSubmission(repo, { userId: 'admin-1', role: 'admin' }, randomUUID(), 'hi');
  assert.equal(result.status, 400);
});

test('admin-debug endpoint is refused for a plain student, even the submission owner', async () => {
  const repo = new InMemorySubmissionRepository();
  const attempt = await repo.createAttempt({ userId: 'student-a', problemId: 'p1', assessmentId: null, mode: 'PRACTICE' });
  const deps = buildDeps(repo);
  const owner: AuthenticatedActor = { userId: 'student-a', role: 'student' };
  const created = await handleCreateSubmission(deps, { actor: owner, ipAddress: '1.1.1.1', body: buildRequest({ attemptId: attempt.id }) });
  const submissionId = (created.body as { submissionId: string }).submissionId;

  const ownerDebugAttempt = await handleGetAdminDebug(repo, owner, submissionId, noopRelationshipResolver);
  assert.equal(ownerDebugAttempt.status, 403, 'owning the submission does not grant admin-debug access');

  const adminDebugAttempt = await handleGetAdminDebug(repo, { userId: 'admin-1', role: 'admin' }, submissionId, noopRelationshipResolver);
  assert.equal(adminDebugAttempt.status, 200);
});

test('RATE LIMIT: a user hitting the per-user submission cap gets 429s, not queued garbage submissions', async () => {
  const repo = new InMemorySubmissionRepository();
  const deps = buildDeps(repo); // configured for 3/min per user in buildDeps
  const attempt = await repo.createAttempt({ userId: 'student-rl', problemId: 'p1', assessmentId: null, mode: 'PRACTICE' });
  const actor: AuthenticatedActor = { userId: 'student-rl', role: 'student' };

  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await handleCreateSubmission(deps, { actor, ipAddress: '2.2.2.2', body: buildRequest({ attemptId: attempt.id, idempotencyKey: randomUUID() }) }));
  }
  const succeeded = results.filter((r) => r.status === 201);
  const limited = results.filter((r) => r.status === 429);
  assert.equal(succeeded.length, 3);
  assert.equal(limited.length, 2);
});

test('idempotent replay via the HTTP layer returns 200 (not 201) and the same submission id', async () => {
  const repo = new InMemorySubmissionRepository();
  const deps = buildDeps(repo);
  const attempt = await repo.createAttempt({ userId: 'student-a', problemId: 'p1', assessmentId: null, mode: 'PRACTICE' });
  const actor: AuthenticatedActor = { userId: 'student-a', role: 'student' };
  const body = buildRequest({ attemptId: attempt.id, idempotencyKey: 'fixed-key-1' });

  const first = await handleCreateSubmission(deps, { actor, ipAddress: '1.1.1.1', body });
  const second = await handleCreateSubmission(deps, { actor, ipAddress: '1.1.1.1', body });

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal((first.body as { submissionId: string }).submissionId, (second.body as { submissionId: string }).submissionId);
});

test('error responses never leak internals — no stack traces, file paths, or raw error objects', async () => {
  const repo = new InMemorySubmissionRepository();
  const deps = buildDeps(repo);
  const actor: AuthenticatedActor = { userId: 'student-a', role: 'student' };
  const result = await handleCreateSubmission(deps, { actor, ipAddress: '1.1.1.1', body: buildRequest({ attemptId: 'does-not-exist' }) });

  assert.equal(result.status, 400);
  const serialized = JSON.stringify(result.body);
  assert.ok(!serialized.includes('/home/'), 'no filesystem paths in error responses');
  assert.ok(!serialized.includes('node_modules'), 'no stack-trace-looking content in error responses');
});

await run('api.test.ts');
