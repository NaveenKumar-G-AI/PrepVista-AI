/**
 * CodeForge AI — Submission System
 * The orchestrator src/api/createSubmission.ts calls. Ties together validation
 * (validation.ts), source fingerprinting (hashing.ts), and atomic creation
 * (repository) into the one function that turns a raw request into a frozen,
 * queued submission — or a clean rejection before anything expensive happens.
 */
import { randomUUID } from 'node:crypto';
import type { SubmissionRepository } from '../repository/submissionRepository.js';
import { IdempotencyInFlightError } from '../repository/submissionRepository.js';
import { runValidationPipeline, ValidationError, type AssessmentWindow, type SupportedLanguage } from './validation.js';
import { computeFileHashes, computeSourceFingerprint } from './hashing.js';
import type { AuthenticatedActor, SubmissionRequest, VersionBinding } from '../domain/types.js';
import type { SubmissionLimitsConfig } from '../domain/config.js';
import { sleep } from '../domain/asyncUtils.js';

export interface VersionResolver {
  /** Resolves and freezes the CURRENT published versions for a problem, at the moment
   * of submission. Never re-resolved after — see spec, "IMMUTABLE VERSION BINDING." */
  resolveCurrentVersions(problemId: string): Promise<VersionBinding>;
}

export interface AssessmentPolicyResolver {
  /** Null for PRACTICE. Returns the server-authoritative window + submission cap for ASSESSMENT/INTERVIEW. */
  resolve(assessmentId: string): Promise<{ window: AssessmentWindow; maxSubmissionsPerAttempt: number | null }>;
}

export interface LanguageCatalog {
  supportedLanguagesFor(problemId: string): Promise<SupportedLanguage[]>;
}

export interface SubmitCodeParams {
  actor: AuthenticatedActor;
  request: SubmissionRequest;
  clientRequestFingerprint: string; // caller-computed hash of the logical request body, for idempotency-key-reuse detection
}

export interface SubmitCodeDependencies {
  repo: SubmissionRepository;
  versionResolver: VersionResolver;
  assessmentPolicyResolver: AssessmentPolicyResolver;
  languageCatalog: LanguageCatalog;
  limits: SubmissionLimitsConfig;
  now: () => Date; // server clock, injectable for tests — never a client timestamp
}

export interface SubmitCodeResult {
  submissionId: string;
  wasReplay: boolean;
}

/**
 * A request that arrives while an identical in-flight request from the same
 * idempotency key hasn't finished yet retries briefly rather than failing outright —
 * this is what makes a double-click feel like ONE submit to the caller instead of an
 * error, while still guaranteeing exactly one submission is ever created.
 */
async function createWithIdempotencyRetry(
  repo: SubmissionRepository,
  params: Parameters<SubmissionRepository['createSubmissionAtomic']>[0],
): Promise<SubmitCodeResult> {
  const MAX_ATTEMPTS = 20;
  const RETRY_DELAY_MS = 50;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { submissionId, wasReplay } = await repo.createSubmissionAtomic(params);
      return { submissionId, wasReplay };
    } catch (err) {
      if (err instanceof IdempotencyInFlightError && attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw new IdempotencyInFlightError(params.idempotencyKey);
}

export async function submitCode(deps: SubmitCodeDependencies, params: SubmitCodeParams): Promise<SubmitCodeResult> {
  const attempt = await deps.repo.getAttemptById(params.request.attemptId);
  if (!attempt) {
    throw new ValidationError('ATTEMPT_NOT_FOUND', `Attempt ${params.request.attemptId} does not exist.`);
  }

  const [supportedLanguages, assessmentPolicy] = await Promise.all([
    deps.languageCatalog.supportedLanguagesFor(attempt.problemId),
    attempt.assessmentId ? deps.assessmentPolicyResolver.resolve(attempt.assessmentId) : Promise.resolve(null),
  ]);

  const existingSubmissions = await deps.repo.listSubmissionsForAttempt(attempt.id);

  runValidationPipeline({
    actor: params.actor,
    attempt,
    request: params.request,
    now: deps.now(),
    assessmentWindow: assessmentPolicy?.window ?? null,
    supportedLanguages,
    limits: deps.limits,
    currentSubmissionCountForAttempt: existingSubmissions.length,
    maxSubmissionsPerAttempt: assessmentPolicy?.maxSubmissionsPerAttempt ?? null,
  });

  // Only after validation passes do we do the (comparatively) expensive work of
  // resolving and freezing versions and hashing the source — "reject invalid
  // submissions early... before consuming expensive execution resources."
  const versions = await deps.versionResolver.resolveCurrentVersions(attempt.problemId);
  const hashedFiles = computeFileHashes(params.request.files);
  const sourceFingerprint = computeSourceFingerprint(params.request.files);
  const totalSourceBytes = hashedFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

  const correlationId = randomUUID();
  await deps.repo.recordAuditEvent({
    eventType: 'submission.validated',
    actorId: params.actor.userId,
    actorRole: params.actor.role,
    submissionId: null,
    evaluationJobId: null,
    correlationId,
    metadata: { attemptId: attempt.id, language: params.request.language }, // never source code
  });

  const result = await createWithIdempotencyRetry(deps.repo, {
    userId: params.actor.userId,
    attemptId: attempt.id,
    problemId: attempt.problemId,
    assessmentId: attempt.assessmentId,
    mode: attempt.mode,
    problemVersionId: versions.problemVersionId,
    testSuiteVersionId: versions.testSuiteVersionId,
    checkerVersionId: versions.checkerVersionId,
    executionConfigSnapshot: versions.executionConfigSnapshot,
    language: params.request.language,
    languageVersion: params.request.languageVersion,
    sourceFingerprint,
    totalSourceBytes,
    files: hashedFiles,
    idempotencyKey: params.request.idempotencyKey,
    requestFingerprint: params.clientRequestFingerprint,
    maxSubmissionsPerAttempt: assessmentPolicy?.maxSubmissionsPerAttempt ?? null,
  });

  await deps.repo.recordAuditEvent({
    eventType: result.wasReplay ? 'submission.replayed' : 'submission.created',
    actorId: params.actor.userId,
    actorRole: params.actor.role,
    submissionId: result.submissionId,
    evaluationJobId: null,
    correlationId,
    metadata: { idempotencyKey: params.request.idempotencyKey },
  });

  return result;
}
