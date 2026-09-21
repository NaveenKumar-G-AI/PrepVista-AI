import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createInterview, advanceState, submitCode, InterviewError,
  InterviewRepository, SubmissionRepository, StoredSubmission,
} from './interviewSessionService';
import { TechnicalInterview, InterviewState } from '../types/domain';
import { CodeExecutionAdapter, EventLoggerAdapter } from '../integration/adapters';

class InMemoryInterviewRepository implements InterviewRepository {
  private byId = new Map<string, TechnicalInterview>();
  private byIdempotencyKey = new Map<string, TechnicalInterview>();
  async findById(id: string) { return this.byId.get(id) ?? null; }
  async findByIdempotencyKey(key: string) { return this.byIdempotencyKey.get(key) ?? null; }
  async insert(interview: TechnicalInterview) {
    this.byId.set(interview.id, interview);
    this.byIdempotencyKey.set(interview.idempotencyKey, interview);
    return interview;
  }
  async updateStatus(id: string, status: InterviewState, extra?: Partial<TechnicalInterview>) {
    const existing = this.byId.get(id);
    if (existing) this.byId.set(id, { ...existing, status, ...extra });
  }
}

class InMemorySubmissionRepository implements SubmissionRepository {
  private byKey = new Map<string, StoredSubmission>();
  async findByIdempotencyKey(problemId: string, key: string) { return this.byKey.get(`${problemId}:${key}`) ?? null; }
  async insert(submission: StoredSubmission) { this.byKey.set(`${submission.problemId}:${submission.idempotencyKey}`, submission); return submission; }
}

test('creating twice with the same idempotency key returns the same interview (PHASE 36)', async () => {
  const repo = new InMemoryInterviewRepository();
  const key = randomUUID();
  const first = await createInterview({ studentId: 's1', blueprintId: 'b1', blueprintVersionId: 'bv1', targetRole: 'Software Engineer', idempotencyKey: key }, repo);
  const second = await createInterview({ studentId: 's1', blueprintId: 'b1', blueprintVersionId: 'bv1', targetRole: 'Software Engineer', idempotencyKey: key }, repo);
  assert.equal(first.id, second.id);
});

test('a student cannot advance another student\'s interview (TEST 5)', async () => {
  const repo = new InMemoryInterviewRepository();
  const interview = await createInterview({ studentId: 'student-a', blueprintId: 'b1', blueprintVersionId: 'bv1', targetRole: 'Software Engineer', idempotencyKey: randomUUID() }, repo);
  await repo.updateStatus(interview.id, 'READY');
  await assert.rejects(
    () => advanceState(interview.id, 'student-b', 'STARTED', repo),
    (err: unknown) => err instanceof InterviewError && err.code === 'UNAUTHORIZED_INTERVIEW',
  );
});

test('an expired interview rejects further transitions even though the state graph would otherwise allow it (TEST 3)', async () => {
  const repo = new InMemoryInterviewRepository();
  const interview = await createInterview({ studentId: 'student-a', blueprintId: 'b1', blueprintVersionId: 'bv1', targetRole: 'Software Engineer', idempotencyKey: randomUUID() }, repo);
  const expired: TechnicalInterview = { ...interview, status: 'CODING', expiresAt: new Date(Date.now() - 1000).toISOString() };
  await repo.insert(expired);
  await assert.rejects(
    () => advanceState(interview.id, 'student-a', 'TESTING', repo),
    (err: unknown) => err instanceof InterviewError && err.code === 'INTERVIEW_EXPIRED',
  );
});

test('code execution result comes straight from the adapter — never fabricated (PHASE 11)', async () => {
  const repo = new InMemoryInterviewRepository();
  const submissions = new InMemorySubmissionRepository();
  const created = await createInterview({ studentId: 'student-a', blueprintId: 'b1', blueprintVersionId: 'bv1', targetRole: 'Software Engineer', idempotencyKey: randomUUID() }, repo);
  const interview: TechnicalInterview = { ...created, status: 'CODING' };
  await repo.insert(interview);

  const execution: CodeExecutionAdapter = {
    run: async () => ({ compiled: true, stderr: null, stdout: 'ok', testResults: [{ name: 'case-1', passed: false, message: 'expected 4 got 3' }], runtimeMs: 12, memoryKb: 900 }),
  };
  const events: EventLoggerAdapter = { log: async () => {} };

  const result = await submitCode(
    { interviewId: interview.id, requestingStudentId: 'student-a', problemId: 'p1', challengeId: 'c1', code: 'def f(): pass', language: 'python', submissionType: 'RUN', idempotencyKey: randomUUID() },
    interview, execution, events, submissions,
  );
  assert.equal(result.passed, false);
  assert.equal(result.executionResult.testResults[0].message, 'expected 4 got 3');
});

test('a duplicate submission with the same idempotency key is not re-executed (TEST 4)', async () => {
  const repo = new InMemoryInterviewRepository();
  const submissions = new InMemorySubmissionRepository();
  const created = await createInterview({ studentId: 'student-a', blueprintId: 'b1', blueprintVersionId: 'bv1', targetRole: 'Software Engineer', idempotencyKey: randomUUID() }, repo);
  const interview: TechnicalInterview = { ...created, status: 'CODING' };
  await repo.insert(interview);

  let calls = 0;
  const execution: CodeExecutionAdapter = {
    run: async () => { calls++; return { compiled: true, stderr: null, stdout: '', testResults: [{ name: 'c1', passed: true }], runtimeMs: 5, memoryKb: 500 }; },
  };
  const events: EventLoggerAdapter = { log: async () => {} };
  const submitParams = {
    interviewId: interview.id, requestingStudentId: 'student-a', problemId: 'p1', challengeId: 'c1',
    code: 'code', language: 'python', submissionType: 'SUBMIT' as const, idempotencyKey: randomUUID(),
  };

  const first = await submitCode(submitParams, interview, execution, events, submissions);
  const second = await submitCode(submitParams, interview, execution, events, submissions);

  assert.equal(calls, 1);
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(second.passed, first.passed);
});
