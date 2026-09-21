import { test, run, assert } from './testHarness.js';
import { InMemorySubmissionRepository } from '../src/repository/inMemorySubmissionRepository.js';
import { ForbiddenError, InvalidStateError } from '../src/repository/submissionRepository.js';
import { makeCreateParams, makeAcceptedFinalizeParams } from './fixtures.js';

async function seedCompletedSubmission(repo: InMemorySubmissionRepository, verdict: 'ACCEPTED' | 'WRONG_ANSWER' = 'WRONG_ANSWER') {
  const { submissionId } = await repo.createSubmissionAtomic(makeCreateParams());
  const job = await repo.claimNextEvaluationJob('worker-initial', 120);
  const result = await repo.finalizeEvaluation(
    makeAcceptedFinalizeParams({ jobId: job!.id, workerId: 'worker-initial', verdict, score: verdict === 'ACCEPTED' ? 100 : 40 }),
  );
  return { submissionId, initialResult: result };
}

test('a student cannot initiate re-evaluation — only admin/instructor/problem_author may', async () => {
  const repo = new InMemorySubmissionRepository();
  const { submissionId } = await seedCompletedSubmission(repo);

  await assert.rejects(
    repo.initiateReevaluation({ submissionId, actorId: 'some-student', actorRole: 'student', reason: 'I think the checker is wrong' }),
    ForbiddenError,
  );
});

test('cannot re-evaluate a submission that is still in flight', async () => {
  const repo = new InMemorySubmissionRepository();
  const { submissionId } = await repo.createSubmissionAtomic(makeCreateParams()); // still QUEUED, never finalized

  await assert.rejects(
    repo.initiateReevaluation({ submissionId, actorId: 'admin-1', actorRole: 'admin', reason: 'too early' }),
    InvalidStateError,
  );
});

test('authorized re-evaluation preserves the original result and links a new one, without deleting history', async () => {
  const repo = new InMemorySubmissionRepository();
  const { submissionId, initialResult } = await seedCompletedSubmission(repo, 'WRONG_ANSWER');

  const job = await repo.initiateReevaluation({
    submissionId,
    actorId: 'admin-1',
    actorRole: 'admin',
    reason: 'checker bug fixed, re-running',
  });
  assert.equal(job.kind, 'REEVALUATION');

  const submissionMidReeval = await repo.getSubmissionById(submissionId);
  assert.equal(submissionMidReeval!.status, 'QUEUED');

  const stillThere = await repo.listEvaluationResultsForSubmission(submissionId);
  assert.equal(stillThere.length, 1);
  assert.equal(stillThere[0]!.id, initialResult.id);
  assert.equal(stillThere[0]!.verdict, 'WRONG_ANSWER', 'original evaluation record is never mutated');

  const claimed = await repo.claimNextEvaluationJob('worker-reeval', 120);
  assert.equal(claimed!.id, job.id);
  const newResult = await repo.finalizeEvaluation(
    makeAcceptedFinalizeParams({ jobId: claimed!.id, workerId: 'worker-reeval', verdict: 'ACCEPTED', score: 100 }),
  );

  const allResults = await repo.listEvaluationResultsForSubmission(submissionId);
  assert.equal(allResults.length, 2, 're-evaluation must add a new result, never overwrite the old one');
  const original = allResults.find((r) => r.id === initialResult.id)!;
  assert.equal(original.isOfficial, false);
  assert.equal(original.verdict, 'WRONG_ANSWER', 'history is immutable — the original verdict is still readable');

  const official = await repo.getOfficialEvaluationResult(submissionId);
  assert.equal(official!.id, newResult.id);
  assert.equal(official!.verdict, 'ACCEPTED');

  const submissionAfter = await repo.getSubmissionById(submissionId);
  assert.equal(submissionAfter!.status, 'COMPLETED');
  assert.equal(submissionAfter!.currentEvaluationResultId, newResult.id);
});

test('the re-evaluation job carries reason + actor for the audit trail', async () => {
  const repo = new InMemorySubmissionRepository();
  const { submissionId } = await seedCompletedSubmission(repo, 'WRONG_ANSWER');

  const job = await repo.initiateReevaluation({
    submissionId,
    actorId: 'instructor-7',
    actorRole: 'instructor',
    reason: 'test-suite bug: expected output had a trailing newline mismatch',
  });
  const claimed = await repo.claimNextEvaluationJob('worker-x', 120);
  await repo.finalizeEvaluation(makeAcceptedFinalizeParams({ jobId: claimed!.id, workerId: 'worker-x', verdict: 'ACCEPTED', score: 100 }));

  assert.equal(job.reevaluationReason, 'test-suite bug: expected output had a trailing newline mismatch');
  assert.equal(job.reevaluationActorId, 'instructor-7');
});

await run('reEvaluation.test.ts');
