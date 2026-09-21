import { test, run, assert } from './testHarness.js';
import { InMemorySubmissionRepository } from '../src/repository/inMemorySubmissionRepository.js';
import { sweepOnce } from '../src/worker/sweeper.js';
import { makeCreateParams } from './fixtures.js';

test('a job stuck past max_attempts is DEAD_LETTERed AND the student sees JUDGE_ERROR, not an eternal QUEUED', async () => {
  const repo = new InMemorySubmissionRepository();
  const { submissionId } = await repo.createSubmissionAtomic(makeCreateParams());

  for (let i = 0; i < 3; i++) {
    const job = await repo.claimNextEvaluationJob(`worker-${i}`, 60);
    await repo._debugExpireLease!(job!.id);
  }

  const result = await sweepOnce(repo, 600);
  assert.equal(result.deadLettered, 1);
  assert.equal(result.judgeErrorsSurfaced, 1);

  const submission = await repo.getSubmissionById(submissionId);
  assert.equal(submission!.status, 'JUDGE_ERROR', 'the student must see a terminal, honest status — never left hanging');
});

test('a job with retries remaining is requeued, and the sweeper does NOT prematurely surface JUDGE_ERROR', async () => {
  const repo = new InMemorySubmissionRepository();
  await repo.createSubmissionAtomic(makeCreateParams());

  const job = await repo.claimNextEvaluationJob('worker-1', 60);
  await repo._debugExpireLease!(job!.id);

  const result = await sweepOnce(repo, 600);
  assert.equal(result.recovered, 1);
  assert.equal(result.deadLettered, 0);
  assert.equal(result.judgeErrorsSurfaced, 0);
});

test('sweeping with nothing stuck is a safe no-op', async () => {
  const repo = new InMemorySubmissionRepository();
  await repo.createSubmissionAtomic(makeCreateParams());
  const result = await sweepOnce(repo, 600);
  assert.deepEqual(result, { recovered: 0, deadLettered: 0, judgeErrorsSurfaced: 0 });
});

await run('sweeper.test.ts');
