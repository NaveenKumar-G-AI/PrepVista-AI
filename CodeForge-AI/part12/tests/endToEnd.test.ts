import { randomUUID } from 'node:crypto';
import { test, run, assert } from './testHarness.js';
import { InMemorySubmissionRepository } from '../src/repository/inMemorySubmissionRepository.js';
import { LocalProcessExecutionProvider } from '../src/execution/localProcessExecutionProvider.js';
import { FixtureProblemDataResolver, AB_SUM_PYTHON } from '../src/worker/fixtureProblemDataResolver.js';
import { processOneJob } from '../src/worker/worker.js';
import { toSubmissionDetailDTO } from '../src/services/dto.js';
import { computeFileHashes, computeSourceFingerprint } from '../src/services/hashing.js';
import type { ExecutionConfig, SubmissionFileInput } from '../src/domain/types.js';
import type { CreateSubmissionAtomicParams } from '../src/repository/submissionRepository.js';

const PROBLEM_VERSION_ID = randomUUID();

const GENEROUS_CONFIG: ExecutionConfig = {
  cpuTimeLimitMs: 4000,
  wallTimeLimitMs: 4000,
  memoryLimitKb: 262144,
  outputLimitBytes: 65536,
  processLimit: 32,
  networkAllowed: false,
};

function buildResolver(): FixtureProblemDataResolver {
  const resolver = new FixtureProblemDataResolver();
  resolver.register(PROBLEM_VERSION_ID, AB_SUM_PYTHON);
  return resolver;
}

async function submitAndProcess(
  repo: InMemorySubmissionRepository,
  executionProvider: LocalProcessExecutionProvider,
  resolver: FixtureProblemDataResolver,
  opts: { language: string; languageVersion: string; filename: string; code: string; config?: ExecutionConfig },
) {
  const files: SubmissionFileInput[] = [{ filename: opts.filename, path: opts.filename, content: opts.code, role: 'MAIN', ordinal: 0 }];
  const hashedFiles = computeFileHashes(files);

  const params: CreateSubmissionAtomicParams = {
    userId: 'student-e2e',
    attemptId: randomUUID(),
    problemId: 'problem-ab-sum',
    assessmentId: null,
    mode: 'PRACTICE',
    problemVersionId: PROBLEM_VERSION_ID,
    testSuiteVersionId: 'ts-v1',
    checkerVersionId: 'checker-v1',
    executionConfigSnapshot: opts.config ?? GENEROUS_CONFIG,
    language: opts.language,
    languageVersion: opts.languageVersion,
    sourceFingerprint: computeSourceFingerprint(files),
    totalSourceBytes: Buffer.byteLength(opts.code, 'utf8'),
    files: hashedFiles,
    idempotencyKey: randomUUID(),
    requestFingerprint: 'e2e-fixture',
    maxSubmissionsPerAttempt: null,
  };

  const { submissionId } = await repo.createSubmissionAtomic(params);
  const submissionBeforeProcessing = await repo.getSubmissionById(submissionId);
  assert.equal(submissionBeforeProcessing!.status, 'QUEUED', 'a freshly created submission must be QUEUED, not already resolved');

  const outcome = await processOneJob({ repo, executionProvider, problemDataResolver: resolver, workerId: 'e2e-worker', leaseSeconds: 60 });
  assert.equal(outcome, 'processed');

  const submissionAfter = await repo.getSubmissionById(submissionId);
  const result = await repo.getOfficialEvaluationResult(submissionId);
  return { submissionId, submission: submissionAfter!, result: result! };
}

test('E2E ACCEPTED: a correct Python solution passes public and hidden tests and scores 100', async () => {
  const repo = new InMemorySubmissionRepository();
  const provider = new LocalProcessExecutionProvider();
  const resolver = buildResolver();

  const { submission, result } = await submitAndProcess(repo, provider, resolver, {
    language: 'python',
    languageVersion: '3.12',
    filename: 'main.py',
    code: 'a, b = map(int, input().split())\nprint(a + b)\n',
  });

  assert.equal(submission.status, 'COMPLETED');
  assert.equal(result.verdict, 'ACCEPTED');
  assert.equal(result.score, 100);
  assert.equal(result.publicResult.passed, result.publicResult.totalTests);
  assert.equal(result.hiddenResult.passedGroups, result.hiddenResult.totalGroups);
  assert.ok(result.resourceUsage.wallMs > 0, 'resource usage must be real, not a fabricated zero/placeholder');
});

test('E2E WRONG_ANSWER: an incorrect solution is graded WRONG_ANSWER with a partial/zero score, not silently accepted', async () => {
  const repo = new InMemorySubmissionRepository();
  const provider = new LocalProcessExecutionProvider();
  const resolver = buildResolver();

  const { submission, result } = await submitAndProcess(repo, provider, resolver, {
    language: 'python',
    languageVersion: '3.12',
    filename: 'main.py',
    code: 'a, b = map(int, input().split())\nprint(a + b + 1)\n', // off-by-one bug
  });

  assert.equal(submission.status, 'COMPLETED');
  assert.equal(result.verdict, 'WRONG_ANSWER');
  assert.equal(result.score, 0, 'every single case is wrong for this bug, so score must be 0, not fabricated partial credit');
});

test('E2E COMPILATION_ERROR: a C submission with a real syntax error fails to compile and scores 0', async () => {
  const repo = new InMemorySubmissionRepository();
  const provider = new LocalProcessExecutionProvider();
  const resolver = buildResolver();

  const { submission, result } = await submitAndProcess(repo, provider, resolver, {
    language: 'c',
    languageVersion: 'gcc13',
    filename: 'main.c',
    code: '#include <stdio.h>\nint main() { printf("oops no semicolon or brace") \n',
  });

  assert.equal(submission.status, 'COMPLETED');
  assert.equal(result.verdict, 'COMPILATION_ERROR');
  assert.equal(result.score, 0);
  assert.equal(result.compilationStatus, 'FAILED');
  assert.ok(result.compilationOutput && result.compilationOutput.length > 0, 'real gcc diagnostic output must be present for the student');
});

test('E2E RUNTIME_ERROR: a crashing solution is graded RUNTIME_ERROR from a real traceback/exit code', async () => {
  const repo = new InMemorySubmissionRepository();
  const provider = new LocalProcessExecutionProvider();
  const resolver = buildResolver();

  const { submission, result } = await submitAndProcess(repo, provider, resolver, {
    language: 'python',
    languageVersion: '3.12',
    filename: 'main.py',
    code: 'a, b = map(int, input().split())\nprint(a / 0)\n',
  });

  assert.equal(submission.status, 'COMPLETED');
  assert.equal(result.verdict, 'RUNTIME_ERROR');
});

test('E2E TIME_LIMIT_EXCEEDED: an infinite loop is really killed and graded TLE, not left hanging', async () => {
  const repo = new InMemorySubmissionRepository();
  const provider = new LocalProcessExecutionProvider();
  const resolver = buildResolver();
  const tightConfig: ExecutionConfig = { ...GENEROUS_CONFIG, wallTimeLimitMs: 500, cpuTimeLimitMs: 500 };

  const start = Date.now();
  const { submission, result } = await submitAndProcess(repo, provider, resolver, {
    language: 'python',
    languageVersion: '3.12',
    filename: 'main.py',
    code: 'a, b = map(int, input().split())\nwhile True:\n    pass\n',
    config: tightConfig,
  });
  const elapsed = Date.now() - start;

  assert.equal(submission.status, 'COMPLETED');
  assert.equal(result.verdict, 'TIME_LIMIT_EXCEEDED');
  assert.ok(elapsed < 10_000, `must not hang the whole pipeline (took ${elapsed}ms for one public case)`);
});

test('E2E MALICIOUS CODE CONTAINED: a fork-bomb-style program is contained — the worker (and this whole test process) survives and produces a terminal verdict', async () => {
  const repo = new InMemorySubmissionRepository();
  const provider = new LocalProcessExecutionProvider();
  const resolver = buildResolver();
  // Kept deliberately short: fork-bomb growth is exponential, so the wall-clock window
  // before kill directly controls the size of the transient process spike this creates.
  // 400ms was verified (see ENGINEERING_REPORT.md, "Malicious-code testing: what
  // actually happened") to be contained and fully settle within ~2s; a longer window
  // is unnecessary to prove containment and is inconsiderate of the shared environment.
  const containedConfig: ExecutionConfig = { ...GENEROUS_CONFIG, wallTimeLimitMs: 400, cpuTimeLimitMs: 400, processLimit: 12 };

  const { submission, result } = await submitAndProcess(repo, provider, resolver, {
    language: 'python',
    languageVersion: '3.12',
    filename: 'main.py',
    code: 'import os\nwhile True:\n    try:\n        os.fork()\n    except Exception:\n        pass\n',
    config: containedConfig,
  });

  // The important assertion is simply that we GOT HERE with a well-formed terminal
  // result at all — a real sandbox escape or an uncontained fork bomb would have hung
  // this test (and likely every test after it) instead of returning cleanly.
  assert.equal(submission.status, 'COMPLETED');
  assert.ok(['TIME_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'MEMORY_LIMIT_EXCEEDED'].includes(result.verdict), `expected a contained-failure verdict, got ${result.verdict}`);
});

test('E2E LEAKAGE CHECK: hidden hard-coded fixture inputs/outputs never reach the student-facing DTO for a real, fully-processed submission', async () => {
  const repo = new InMemorySubmissionRepository();
  const provider = new LocalProcessExecutionProvider();
  const resolver = buildResolver();

  const { submissionId, result } = await submitAndProcess(repo, provider, resolver, {
    language: 'python',
    languageVersion: '3.12',
    filename: 'main.py',
    code: 'a, b = map(int, input().split())\nprint(a + b)\n',
  });

  const files = await repo.getSubmissionFiles(submissionId);
  const dto = toSubmissionDetailDTO((await repo.getSubmissionById(submissionId))!, files, result, []);
  const serialized = JSON.stringify(dto);

  // These strings only exist inside AB_SUM_PYTHON's hidden groups (never in the public
  // cases, never in the student's own source) — if any of them show up, hidden test
  // data leaked through the response layer.
  for (const secret of ['999999', '1000000', '-5 -5', '100 200']) {
    assert.ok(!serialized.includes(secret), `hidden fixture value "${secret}" must never appear in the student-facing DTO`);
  }
  assert.deepEqual(Object.keys(dto.result!.hiddenResult).sort(), ['earnedWeight', 'passedGroups', 'totalGroups', 'totalWeight']);
});

await run('endToEnd.test.ts');
