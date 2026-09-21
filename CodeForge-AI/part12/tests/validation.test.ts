import { test, run, assert } from './testHarness.js';
import {
  ValidationError,
  runValidationPipeline,
  validateDeadline,
  validateFiles,
  type ValidationContext,
} from '../src/services/validation.js';
import type { Attempt, SubmissionFileInput, SubmissionRequest } from '../src/domain/types.js';
import { loadConfig } from '../src/domain/config.js';

const limits = loadConfig({}).limits;

function baseAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'attempt-1',
    userId: 'user-1',
    problemId: 'problem-1',
    assessmentId: null,
    mode: 'PRACTICE',
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function baseRequest(overrides: Partial<SubmissionRequest> = {}): SubmissionRequest {
  const files: SubmissionFileInput[] = overrides.files ?? [{ filename: 'main.py', path: 'main.py', content: 'print(1)', role: 'MAIN', ordinal: 0 }];
  return {
    attemptId: 'attempt-1',
    language: 'python',
    languageVersion: '3.12',
    idempotencyKey: 'idem-1',
    ...overrides,
    files,
  };
}

function baseContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    actor: { userId: 'user-1', role: 'student' },
    attempt: baseAttempt(),
    request: baseRequest(),
    now: new Date('2026-08-17T12:00:00Z'),
    assessmentWindow: null,
    supportedLanguages: [{ language: 'python', version: '3.12' }],
    limits,
    currentSubmissionCountForAttempt: 0,
    maxSubmissionsPerAttempt: null,
    ...overrides,
  };
}

test('a fully valid context passes the whole pipeline without throwing', () => {
  assert.doesNotThrow(() => runValidationPipeline(baseContext()));
});

test('ownership: an attempt belonging to a different user is rejected', () => {
  const ctx = baseContext({ attempt: baseAttempt({ userId: 'someone-else' }) });
  assert.throws(() => runValidationPipeline(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'NOT_OWNER');
});

test('language: an unsupported language/version is rejected', () => {
  const ctx = baseContext({ request: baseRequest({ language: 'cobol', languageVersion: '1985' }) });
  assert.throws(() => runValidationPipeline(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'UNSUPPORTED_LANGUAGE');
});

test('language: correct language but unsupported version is still rejected', () => {
  const ctx = baseContext({ request: baseRequest({ language: 'python', languageVersion: '2.7' }) });
  assert.throws(() => runValidationPipeline(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'UNSUPPORTED_LANGUAGE');
});

test('files: zero files is rejected', () => {
  const ctx = baseContext({ request: baseRequest({ files: [] }) });
  assert.throws(() => validateFiles(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'NO_FILES');
});

test('files: too many files is rejected', () => {
  const many: SubmissionFileInput[] = Array.from({ length: limits.maxFilesPerSubmission + 1 }, (_, i) => ({
    filename: `f${i}.py`,
    path: `f${i}.py`,
    content: 'x=1',
    role: i === 0 ? 'MAIN' : 'SUPPORTING',
    ordinal: i,
  }));
  const ctx = baseContext({ request: baseRequest({ files: many }) });
  assert.throws(() => validateFiles(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'TOO_MANY_FILES');
});

test('files: a single oversized file is rejected even if the total is small', () => {
  const big = 'x'.repeat(limits.maxFileSizeBytes + 1);
  const ctx = baseContext({ request: baseRequest({ files: [{ filename: 'main.py', path: 'main.py', content: big, role: 'MAIN', ordinal: 0 }] }) });
  assert.throws(() => validateFiles(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'FILE_TOO_LARGE');
});

test('files: path traversal attempts are rejected', () => {
  for (const badPath of ['../../etc/passwd', '/etc/passwd', 'a/../../b.py', 'sub\\..\\x.py']) {
    const ctx = baseContext({ request: baseRequest({ files: [{ filename: 'x', path: badPath, content: 'x', role: 'MAIN', ordinal: 0 }] }) });
    assert.throws(() => validateFiles(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'PATH_TRAVERSAL', `should reject path: ${badPath}`);
  }
});

test('files: duplicate paths are rejected', () => {
  const ctx = baseContext({
    request: baseRequest({
      files: [
        { filename: 'a.py', path: 'a.py', content: '1', role: 'MAIN', ordinal: 0 },
        { filename: 'a.py', path: 'a.py', content: '2', role: 'SUPPORTING', ordinal: 1 },
      ],
    }),
  });
  assert.throws(() => validateFiles(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'DUPLICATE_PATH');
});

test('files: no MAIN file is rejected', () => {
  const ctx = baseContext({ request: baseRequest({ files: [{ filename: 'util.py', path: 'util.py', content: 'x', role: 'SUPPORTING', ordinal: 0 }] }) });
  assert.throws(() => validateFiles(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'NO_MAIN_FILE');
});

test('files: more than one MAIN file is rejected', () => {
  const ctx = baseContext({
    request: baseRequest({
      files: [
        { filename: 'a.py', path: 'a.py', content: '1', role: 'MAIN', ordinal: 0 },
        { filename: 'b.py', path: 'b.py', content: '2', role: 'MAIN', ordinal: 1 },
      ],
    }),
  });
  assert.throws(() => validateFiles(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'MULTIPLE_MAIN_FILES');
});

test('DEADLINE: submission strictly before the assessment window has started is rejected', () => {
  const ctx = baseContext({
    assessmentWindow: { startsAt: new Date('2026-08-17T13:00:00Z'), endsAt: new Date('2026-08-17T15:00:00Z') },
    now: new Date('2026-08-17T12:59:59Z'),
  });
  assert.throws(() => validateDeadline(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'ASSESSMENT_NOT_STARTED');
});

test('DEADLINE: submission exactly at the window boundaries is accepted (inclusive)', () => {
  const window = { startsAt: new Date('2026-08-17T13:00:00Z'), endsAt: new Date('2026-08-17T15:00:00Z') };
  assert.doesNotThrow(() => validateDeadline(baseContext({ assessmentWindow: window, now: window.startsAt })));
  assert.doesNotThrow(() => validateDeadline(baseContext({ assessmentWindow: window, now: window.endsAt })));
});

test('DEADLINE: submission one second after the window end is rejected', () => {
  const ctx = baseContext({
    assessmentWindow: { startsAt: new Date('2026-08-17T13:00:00Z'), endsAt: new Date('2026-08-17T15:00:00Z') },
    now: new Date('2026-08-17T15:00:01Z'),
  });
  assert.throws(() => validateDeadline(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'DEADLINE_PASSED');
});

test('DEADLINE: PRACTICE mode (no assessment window) never enforces a deadline', () => {
  assert.doesNotThrow(() => validateDeadline(baseContext({ assessmentWindow: null, now: new Date('2099-01-01T00:00:00Z') })));
});

test('QUOTA precheck: at-limit is rejected before hitting the DB', () => {
  const ctx = baseContext({ currentSubmissionCountForAttempt: 3, maxSubmissionsPerAttempt: 3 });
  assert.throws(() => runValidationPipeline(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'QUOTA_EXCEEDED');
});

test('QUOTA precheck: unlimited (null) never rejects regardless of count', () => {
  const ctx = baseContext({ currentSubmissionCountForAttempt: 9999, maxSubmissionsPerAttempt: null });
  assert.doesNotThrow(() => runValidationPipeline(ctx));
});

test('missing idempotency key is rejected before any other check runs', () => {
  const ctx = baseContext({ request: baseRequest({ idempotencyKey: '' }), attempt: baseAttempt({ userId: 'someone-else' }) });
  // Even though ownership would ALSO fail, idempotency-key-missing is checked first (cheapest, no I/O needed).
  assert.throws(() => runValidationPipeline(ctx), (err: unknown) => err instanceof ValidationError && err.code === 'MISSING_IDEMPOTENCY_KEY');
});

await run('validation.test.ts');
