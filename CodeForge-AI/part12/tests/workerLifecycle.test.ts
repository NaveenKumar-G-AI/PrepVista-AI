import { test, run, assert } from './testHarness.js';
import { InMemorySubmissionRepository } from '../src/repository/inMemorySubmissionRepository.js';
import { StaleClaimError } from '../src/repository/submissionRepository.js';
import { makeCreateParams, makeAcceptedFinalizeParams } from './fixtures.js';

async function seedQueuedSubmission(repo: InMemorySubmissionRepository) {
  const { submissionId } = await repo.createSubmissionAtomic(makeCreateParams());
  // Peek at the internal job the create call enqueued by claiming and immediately
  // "un-claiming" it would corrupt state, so instead we claim it directly below in each
  // test — this helper just gets us a submission with exactly one QUEUED job.
  return submissionId;
}

test('claim: a queued job is claimed exactly once and marked CLAIMED', async () => {
  const repo = new InMemorySubmissionRepository();
  await seedQueuedSubmission(repo);

  const job = await repo.claimNextEvaluationJob('worker-1', 120);
  assert.ok(job);
  assert.equal(job!.status, 'CLAIMED');
  assert.equal(job!.claimedBy, 'worker-1');

  const again = await repo.claimNextEvaluationJob('worker-2', 120);
  assert.equal(again, null, 'no second job available — the only job is already claimed and not expired');
});

test('CONCURRENCY: multiple workers racing a small job pool never claim the same job twice', async () => {
  const repo = new InMemorySubmissionRepository();
  const JOB_COUNT = 5;
  for (let i = 0; i < JOB_COUNT; i++) await seedQueuedSubmission(repo);

  const WORKER_COUNT = 12;
  const results = await Promise.all(
    Array.from({ length: WORKER_COUNT }, (_, i) => repo.claimNextEvaluationJob(`worker-${i}`, 120)),
  );

  const claimed = results.filter((r): r is NonNullable<typeof r> => r !== null);
  const claimedJobIds = claimed.map((j) => j.id);
  const uniqueJobIds = new Set(claimedJobIds);

  assert.equal(claimed.length, JOB_COUNT, `exactly ${JOB_COUNT} of ${WORKER_COUNT} workers should get a job`);
  assert.equal(uniqueJobIds.size, JOB_COUNT, 'no two workers may claim the same job');
});

test('lease expiry: an expired claim becomes reclaimable by a different worker', async () => {
  const repo = new InMemorySubmissionRepository();
  await seedQueuedSubmission(repo);

  const first = await repo.claimNextEvaluationJob('worker-A', 120);
  assert.ok(first);
  await repo._debugExpireLease!(first!.id);

  const reclaimed = await repo.claimNextEvaluationJob('worker-B', 120);
  assert.ok(reclaimed);
  assert.equal(reclaimed!.id, first!.id);
  assert.equal(reclaimed!.claimedBy, 'worker-B');
  assert.equal(reclaimed!.attemptCount, 2, 'attempt_count increments on every claim, including reclaims');
});

test('finalize: the legitimate claimant finalizes successfully and the submission reflects the result', async () => {
  const repo = new InMemorySubmissionRepository();
  const submissionId = await seedQueuedSubmission(repo);
  const job = await repo.claimNextEvaluationJob('worker-1', 120);
  await repo.markEvaluationJobRunning(job!.id, 'worker-1');

  const result = await repo.finalizeEvaluation(makeAcceptedFinalizeParams({ jobId: job!.id, workerId: 'worker-1' }));
  assert.equal(result.verdict, 'ACCEPTED');
  assert.equal(result.isOfficial, true);

  const submission = await repo.getSubmissionById(submissionId);
  assert.equal(submission!.status, 'COMPLETED');
  assert.equal(submission!.currentEvaluationResultId, result.id);

  const official = await repo.getOfficialEvaluationResult(submissionId);
  assert.equal(official!.id, result.id);
});

test('JUDGE_ERROR verdict moves the submission to JUDGE_ERROR, never COMPLETED — infra failure is never a student failure', async () => {
  const repo = new InMemorySubmissionRepository();
  const submissionId = await seedQueuedSubmission(repo);
  const job = await repo.claimNextEvaluationJob('worker-1', 120);

  await repo.finalizeEvaluation(
    makeAcceptedFinalizeParams({ jobId: job!.id, workerId: 'worker-1', verdict: 'JUDGE_ERROR', score: 0, terminationReason: 'sandbox crashed' }),
  );

  const submission = await repo.getSubmissionById(submissionId);
  assert.equal(submission!.status, 'JUDGE_ERROR');
});

test('STALE CLAIM: a zombie worker whose lease was reclaimed cannot finalize after another worker already did', async () => {
  const repo = new InMemorySubmissionRepository();
  const submissionId = await seedQueuedSubmission(repo);

  const claimA = await repo.claimNextEvaluationJob('worker-A', 120);
  await repo._debugExpireLease!(claimA!.id);
  const claimB = await repo.claimNextEvaluationJob('worker-B', 120);
  assert.equal(claimB!.id, claimA!.id);

  // B (the legitimate current claimant) finishes first.
  const resultB = await repo.finalizeEvaluation(
    makeAcceptedFinalizeParams({ jobId: claimB!.id, workerId: 'worker-B', verdict: 'ACCEPTED', score: 100 }),
  );

  // A is a zombie: it still thinks it holds the claim and tries to finalize with a
  // DIFFERENT (wrong) result. This must be rejected, not silently overwrite B's result.
  await assert.rejects(
    repo.finalizeEvaluation(makeAcceptedFinalizeParams({ jobId: claimA!.id, workerId: 'worker-A', verdict: 'WRONG_ANSWER', score: 0 })),
    StaleClaimError,
  );

  const official = await repo.getOfficialEvaluationResult(submissionId);
  assert.equal(official!.id, resultB.id, "B's result must remain official");
  assert.equal(official!.verdict, 'ACCEPTED', "A's stale WRONG_ANSWER must never have been written");

  const allResults = await repo.listEvaluationResultsForSubmission(submissionId);
  assert.equal(allResults.length, 1, 'the rejected stale finalize must not have inserted a second result row');
});

test('CONCURRENCY: two workers finalizing the exact same job simultaneously — exactly one wins, one official result exists', async () => {
  const repo = new InMemorySubmissionRepository();
  const submissionId = await seedQueuedSubmission(repo);
  const job = await repo.claimNextEvaluationJob('worker-1', 120);

  // Simulate two duplicate finalize calls for the SAME job+worker racing each other
  // (e.g. a retried RPC after a network blip the first call actually succeeded on).
  const outcomes = await Promise.allSettled([
    repo.finalizeEvaluation(makeAcceptedFinalizeParams({ jobId: job!.id, workerId: 'worker-1', verdict: 'ACCEPTED' })),
    repo.finalizeEvaluation(makeAcceptedFinalizeParams({ jobId: job!.id, workerId: 'worker-1', verdict: 'ACCEPTED' })),
  ]);

  const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
  const failed = outcomes.filter((o) => o.status === 'rejected');
  assert.equal(succeeded.length, 1, 'exactly one of the two duplicate finalize calls may succeed');
  assert.equal(failed.length, 1);
  if (failed[0]!.status === 'rejected') assert.ok(failed[0]!.reason instanceof StaleClaimError);

  const allResults = await repo.listEvaluationResultsForSubmission(submissionId);
  assert.equal(allResults.length, 1, 'no duplicate result row from the race');
});

test('stuck job recovery: an expired CLAIMED job with attempts remaining is requeued, not lost', async () => {
  const repo = new InMemorySubmissionRepository();
  await seedQueuedSubmission(repo);
  const job = await repo.claimNextEvaluationJob('worker-crashed', 120);
  await repo._debugExpireLease!(job!.id);

  const recovered = await repo.recoverStuckEvaluationJobs(600);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0]!.newStatus, 'QUEUED', 'first crash: requeue for another attempt, do not give up yet');

  const reclaimable = await repo.claimNextEvaluationJob('worker-fresh', 120);
  assert.ok(reclaimable, 'the recovered job must be claimable again — the student is never left waiting forever');
  assert.equal(reclaimable!.id, job!.id);
});

test('stuck job recovery: a job that has exhausted max_attempts is DEAD_LETTERed, not requeued forever', async () => {
  const repo = new InMemorySubmissionRepository();
  await seedQueuedSubmission(repo);

  // Exhaust attempts by repeatedly claiming + expiring (mirrors N real worker crashes).
  let jobId = '';
  for (let i = 0; i < 3; i++) {
    const job = await repo.claimNextEvaluationJob(`worker-${i}`, 120);
    jobId = job!.id;
    await repo._debugExpireLease!(job!.id);
  }

  const recovered = await repo.recoverStuckEvaluationJobs(600);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0]!.jobId, jobId);
  assert.equal(recovered[0]!.newStatus, 'DEAD_LETTER', 'after max_attempts crashes, stop retrying — the sweeper must surface JUDGE_ERROR instead');
});

await run('workerLifecycle.test.ts');
