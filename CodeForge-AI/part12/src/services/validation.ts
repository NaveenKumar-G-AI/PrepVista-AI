/**
 * CodeForge AI — Submission System
 * Request validation. Everything here runs BEFORE a submission row is ever created —
 * "reject invalid submissions early" — so a bad request never reaches
 * createSubmissionAtomic() or consumes a queue slot. Each check is a small, independently
 * testable pure function; runValidationPipeline() just orders them cheapest-first.
 *
 * Deadline checks take `now` as an explicit parameter (server time, injected by the
 * caller from `new Date()` or the DB's `now()` — never from a client-supplied
 * timestamp) specifically so nothing in this file can silently drift into trusting the
 * browser's clock.
 */
import type { Attempt, AuthenticatedActor, SubmissionRequest } from '../domain/types.js';
import type { SubmissionLimitsConfig } from '../domain/config.js';

export class ValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface AssessmentWindow {
  startsAt: Date;
  endsAt: Date;
}

export interface SupportedLanguage {
  language: string;
  version: string;
}

export interface ValidationContext {
  actor: AuthenticatedActor;
  attempt: Attempt;
  request: SubmissionRequest;
  now: Date;
  assessmentWindow: AssessmentWindow | null; // null for PRACTICE
  supportedLanguages: readonly SupportedLanguage[];
  limits: SubmissionLimitsConfig;
  currentSubmissionCountForAttempt: number;
  maxSubmissionsPerAttempt: number | null;
}

export function validateOwnership(ctx: ValidationContext): void {
  if (ctx.attempt.userId !== ctx.actor.userId) {
    throw new ValidationError('NOT_OWNER', 'This attempt does not belong to the authenticated user.');
  }
}

export function validateLanguageSupport(ctx: ValidationContext): void {
  const ok = ctx.supportedLanguages.some((l) => l.language === ctx.request.language && l.version === ctx.request.languageVersion);
  if (!ok) {
    throw new ValidationError('UNSUPPORTED_LANGUAGE', `Language ${ctx.request.language}@${ctx.request.languageVersion} is not supported for this problem.`);
  }
}

const PATH_TRAVERSAL_PATTERN = /(^\/|\.\.|\\)/;

export function validateFiles(ctx: ValidationContext): void {
  const { files } = ctx.request;
  const { limits } = ctx;

  if (files.length === 0) {
    throw new ValidationError('NO_FILES', 'A submission must include at least one file.');
  }
  if (files.length > limits.maxFilesPerSubmission) {
    throw new ValidationError('TOO_MANY_FILES', `Submission has ${files.length} files, exceeding the limit of ${limits.maxFilesPerSubmission}.`);
  }

  const seenPaths = new Set<string>();
  let totalBytes = 0;

  for (const f of files) {
    if (!f.path || f.path.trim().length === 0) {
      throw new ValidationError('INVALID_FILENAME', 'Every file must have a non-empty path.');
    }
    if (PATH_TRAVERSAL_PATTERN.test(f.path)) {
      throw new ValidationError('PATH_TRAVERSAL', `File path "${f.path}" is not allowed (absolute paths and ".." are rejected).`);
    }
    if (seenPaths.has(f.path)) {
      throw new ValidationError('DUPLICATE_PATH', `Duplicate file path "${f.path}" in submission.`);
    }
    seenPaths.add(f.path);

    const sizeBytes = Buffer.byteLength(f.content, 'utf8');
    if (sizeBytes > limits.maxFileSizeBytes) {
      throw new ValidationError('FILE_TOO_LARGE', `File "${f.path}" is ${sizeBytes} bytes, exceeding the per-file limit of ${limits.maxFileSizeBytes}.`);
    }
    totalBytes += sizeBytes;
  }

  if (totalBytes > limits.maxSourceSizeBytes) {
    throw new ValidationError('SOURCE_TOO_LARGE', `Total source is ${totalBytes} bytes, exceeding the limit of ${limits.maxSourceSizeBytes}.`);
  }
  if (totalBytes > limits.maxTotalSubmissionBytes) {
    throw new ValidationError('SUBMISSION_TOO_LARGE', `Total submission is ${totalBytes} bytes, exceeding the limit of ${limits.maxTotalSubmissionBytes}.`);
  }
  if (!files.some((f) => f.role === 'MAIN')) {
    throw new ValidationError('NO_MAIN_FILE', 'A submission must designate exactly one file with role MAIN.');
  }
  if (files.filter((f) => f.role === 'MAIN').length > 1) {
    throw new ValidationError('MULTIPLE_MAIN_FILES', 'A submission may only designate one file with role MAIN.');
  }
}

/** Server-authoritative. `ctx.now` must come from the server clock, never a client timestamp. */
export function validateDeadline(ctx: ValidationContext): void {
  if (!ctx.assessmentWindow) return; // PRACTICE mode has no deadline
  if (ctx.now.getTime() < ctx.assessmentWindow.startsAt.getTime()) {
    throw new ValidationError('ASSESSMENT_NOT_STARTED', 'This assessment has not started yet.');
  }
  if (ctx.now.getTime() > ctx.assessmentWindow.endsAt.getTime()) {
    throw new ValidationError('DEADLINE_PASSED', 'The submission deadline for this assessment has passed.');
  }
}

/**
 * A fast precheck only — avoids wasting a DB round-trip on an obviously-over-quota
 * request. It is NOT the race-free enforcement point; that's
 * create_submission_atomic()'s row-locked count check (0002_functions.sql) /
 * createSubmissionAtomic()'s per-attempt mutex in the in-memory repo. Concurrent
 * requests that both pass this precheck are still correctly serialized there.
 */
export function validateQuotaPrecheck(ctx: ValidationContext): void {
  if (ctx.maxSubmissionsPerAttempt !== null && ctx.currentSubmissionCountForAttempt >= ctx.maxSubmissionsPerAttempt) {
    throw new ValidationError('QUOTA_EXCEEDED', `This attempt has already reached its submission limit of ${ctx.maxSubmissionsPerAttempt}.`);
  }
}

export function validateIdempotencyKeyPresent(ctx: ValidationContext): void {
  if (!ctx.request.idempotencyKey || ctx.request.idempotencyKey.trim().length === 0) {
    throw new ValidationError('MISSING_IDEMPOTENCY_KEY', 'A client-generated idempotency key is required.');
  }
}

/** Ordered cheapest/cheapest-to-reject first, so an obviously-bad request never reaches the expensive checks. */
const PIPELINE: ((ctx: ValidationContext) => void)[] = [
  validateIdempotencyKeyPresent,
  validateOwnership,
  validateLanguageSupport,
  validateFiles,
  validateDeadline,
  validateQuotaPrecheck,
];

export function runValidationPipeline(ctx: ValidationContext): void {
  for (const step of PIPELINE) step(ctx);
}
