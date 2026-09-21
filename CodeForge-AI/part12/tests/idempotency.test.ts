import { test, run, assert } from './testHarness.js';
import { InMemorySubmissionRepository } from '../src/repository/inMemorySubmissionRepository.js';
import { IdempotencyInFlightError, IdempotencyKeyReuseMismatchError, QuotaExceededError } from '../src/repository/submissionRepository.js';
import { makeCreateParams } from './fixtures.js';
import { sleep } from '../src/domain/asyncUtils.js';

test('basic create: submission + file + job all persisted correctly', async () => {
  const repo = new InMemorySubmissionRepository({ artificialLatencyMs: 0 });
  const params = makeCreateParams();
  const { submissionId, wasReplay } = await repo.createSubmissionAtomic(params);

  assert.equal(wasReplay, false);
  const submission = await repo.getSubmissionById(submissionId);
  assert.ok(submission);
  assert.equal(submission!.status, 'QUEUED');
  assert.equal(submission!.submissionNumber, 1);
  assert.equal(submission!.sourceFingerprint, params.sourceFingerprint);

  const files = await repo.getSubmissionFiles(submissionId);
  assert.equal(files.length, 1);
  assert.equal(files[0]!.path, 'main.py');
});

test('replay: identical idempotency key + identical request returns the SAME submission, creates no duplicate', async () => {
  const repo = new InMemorySubmissionRepository({ artificialLatencyMs: 0 });
  const params = makeCreateParams();

  const first = await repo.createSubmissionAtomic(params);
  const second = await repo.createSubmissionAtomic(params); // exact same params object -> same idempotency key + fingerprint

  assert.equal(first.wasReplay, false);
  assert.equal(second.wasReplay, true);
  assert.equal(first.submissionId, second.submissionId);

  const all = await repo.listSubmissionsForAttempt(params.attemptId);
  assert.equal(all.length, 1, 'exactly one submission must exist despite two create calls');
});

test('key reuse with a DIFFERENT request body is rejected, not silently replayed', async () => {
  const repo = new InMemorySubmissionRepository({ artificialLatencyMs: 0 });
  const key = 'shared-key-1';
  const attemptId = (await repo.createAttempt({ userId: 'u1', problemId: 'p1', assessmentId: null, mode: 'PRACTICE' })).id;

  await repo.createSubmissionAtomic(makeCreateParams({ attemptId, userId: 'u1', idempotencyKey: key, requestFingerprint: 'body-A' }));

  await assert.rejects(
    repo.createSubmissionAtomic(makeCreateParams({ attemptId, userId: 'u1', idempotencyKey: key, requestFingerprint: 'body-B' })),
    IdempotencyKeyReuseMismatchError,
  );
});

test('CONCURRENCY: N simultaneous double-submits with the same idempotency key produce exactly one submission', async () => {
  const repo = new InMemorySubmissionRepository({ artificialLatencyMs: 5 });
  const params = makeCreateParams();
  const N = 12;

  async function attemptWithRetry(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      try {
        const { submissionId } = await repo.createSubmissionAtomic(params);
        return submissionId;
      } catch (err) {
        if (err instanceof IdempotencyInFlightError) {
          await sleep(1);
          continue;
        }
        throw err;
      }
    }
    throw new Error('gave up retrying');
  }

  const results = await Promise.all(Array.from({ length: N }, () => attemptWithRetry()));
  const uniqueIds = new Set(results);
  assert.equal(uniqueIds.size, 1, `all ${N} concurrent callers must resolve to the same submission id`);

  const all = await repo.listSubmissionsForAttempt(params.attemptId);
  assert.equal(all.length, 1, 'exactly one submission row must exist after the race');
});

test('QUOTA: sequential submissions beyond the limit are rejected', async () => {
  const repo = new InMemorySubmissionRepository({ artificialLatencyMs: 0 });
  const attempt = await repo.createAttempt({ userId: 'u2', problemId: 'p2', assessmentId: 'a2', mode: 'ASSESSMENT' });

  await repo.createSubmissionAtomic(makeCreateParams({ attemptId: attempt.id, userId: 'u2', maxSubmissionsPerAttempt: 2 }));
  await repo.createSubmissionAtomic(makeCreateParams({ attemptId: attempt.id, userId: 'u2', maxSubmissionsPerAttempt: 2 }));

  await assert.rejects(
    repo.createSubmissionAtomic(makeCreateParams({ attemptId: attempt.id, userId: 'u2', maxSubmissionsPerAttempt: 2 })),
    QuotaExceededError,
  );

  const all = await repo.listSubmissionsForAttempt(attempt.id);
  assert.equal(all.length, 2);
});

test('QUOTA under CONCURRENCY: exactly `limit` submissions succeed, never more, even with simultaneous requests', async () => {
  const repo = new InMemorySubmissionRepository({ artificialLatencyMs: 3 });
  const attempt = await repo.createAttempt({ userId: 'u3', problemId: 'p3', assessmentId: 'a3', mode: 'ASSESSMENT' });
  const LIMIT = 3;
  const ATTEMPTS = 8;

  const outcomes = await Promise.allSettled(
    Array.from({ length: ATTEMPTS }, () =>
      repo.createSubmissionAtomic(makeCreateParams({ attemptId: attempt.id, userId: 'u3', maxSubmissionsPerAttempt: LIMIT })),
    ),
  );

  const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
  const failed = outcomes.filter((o) => o.status === 'rejected');
  assert.equal(succeeded.length, LIMIT, `exactly ${LIMIT} of ${ATTEMPTS} concurrent submits should succeed`);
  assert.equal(failed.length, ATTEMPTS - LIMIT);
  for (const f of failed) {
    if (f.status === 'rejected') assert.ok(f.reason instanceof QuotaExceededError);
  }

  const all = await repo.listSubmissionsForAttempt(attempt.id);
  assert.equal(all.length, LIMIT, 'quota must never be overshot under concurrency');

  const numbers = all.map((s) => s.submissionNumber).sort((a, b) => a - b);
  assert.deepEqual(numbers, [1, 2, 3], 'submission numbers must be sequential and unique with no gaps or duplicates');
});

test('two different attempts do not block or interfere with each other', async () => {
  const repo = new InMemorySubmissionRepository({ artificialLatencyMs: 2 });
  const a1 = await repo.createAttempt({ userId: 'u4', problemId: 'p4', assessmentId: null, mode: 'PRACTICE' });
  const a2 = await repo.createAttempt({ userId: 'u5', problemId: 'p4', assessmentId: null, mode: 'PRACTICE' });

  const [r1, r2] = await Promise.all([
    repo.createSubmissionAtomic(makeCreateParams({ attemptId: a1.id, userId: 'u4' })),
    repo.createSubmissionAtomic(makeCreateParams({ attemptId: a2.id, userId: 'u5' })),
  ]);

  assert.notEqual(r1.submissionId, r2.submissionId);
  assert.equal((await repo.listSubmissionsForAttempt(a1.id)).length, 1);
  assert.equal((await repo.listSubmissionsForAttempt(a2.id)).length, 1);
});

await run('idempotency.test.ts');
