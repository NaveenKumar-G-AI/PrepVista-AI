/**
 * CodeForge AI — Submission System
 * The repository interface. Every write in this system that isn't a pure in-memory
 * computation goes through here, and every method maps 1:1 to a SECURITY DEFINER
 * function in db/migrations/0002_functions.sql. This is what lets
 * src/repository/inMemorySubmissionRepository.ts stand in for Postgres in tests: the
 * business logic in src/services/* is written against this interface, never against a
 * specific storage engine.
 */
import type {
  Attempt,
  AuditEvent,
  EvaluationJob,
  EvaluationResult,
  Submission,
  SubmissionFile,
  VersionBinding,
} from '../domain/types.js';
import type { EvaluationJobStatus, SubmissionMode, SubmissionStatus, UserRole, Verdict } from '../domain/enums.js';

export interface CreateSubmissionAtomicParams extends VersionBinding {
  userId: string;
  attemptId: string;
  problemId: string;
  assessmentId: string | null;
  mode: SubmissionMode;
  language: string;
  languageVersion: string;
  sourceFingerprint: string;
  totalSourceBytes: number;
  files: {
    filename: string;
    path: string;
    content: string;
    sizeBytes: number;
    sha256: string;
    role: string;
    ordinal: number;
  }[];
  idempotencyKey: string;
  requestFingerprint: string;
  maxSubmissionsPerAttempt: number | null;
}

export interface FinalizeEvaluationParams {
  jobId: string;
  workerId: string;
  compilationStatus: 'NOT_REQUIRED' | 'SUCCESS' | 'FAILED';
  compilationOutput: string | null;
  publicResult: EvaluationResult['publicResult'];
  hiddenResult: EvaluationResult['hiddenResult'];
  resourceUsage: EvaluationResult['resourceUsage'];
  verdict: Verdict;
  score: number;
  terminationReason: string | null;
}

export class StaleClaimError extends Error {
  constructor(jobId: string, workerId: string) {
    super(`STALE_CLAIM: job ${jobId} is no longer held by worker ${workerId}`);
    this.name = 'StaleClaimError';
  }
}
export class QuotaExceededError extends Error {
  constructor(attemptId: string, limit: number) {
    super(`QUOTA_EXCEEDED: attempt ${attemptId} has reached its submission limit (${limit})`);
    this.name = 'QuotaExceededError';
  }
}
export class IdempotencyInFlightError extends Error {
  constructor(key: string) {
    super(`IDEMPOTENCY_IN_FLIGHT: another request with key ${key} is still being processed`);
    this.name = 'IdempotencyInFlightError';
  }
}
export class IdempotencyKeyReuseMismatchError extends Error {
  constructor(key: string) {
    super(`IDEMPOTENCY_KEY_REUSE_MISMATCH: key ${key} was used for a different request body`);
    this.name = 'IdempotencyKeyReuseMismatchError';
  }
}
export class ForbiddenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ForbiddenError';
  }
}
export class InvalidStateError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'InvalidStateError';
  }
}
export class NotFoundError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'NotFoundError';
  }
}

export interface SubmissionRepository {
  createAttempt(input: { userId: string; problemId: string; assessmentId: string | null; mode: SubmissionMode }): Promise<Attempt>;
  getAttemptById(id: string): Promise<Attempt | null>;

  /** Mirrors create_submission_atomic(). Throws QuotaExceededError / IdempotencyInFlightError / IdempotencyKeyReuseMismatchError. */
  createSubmissionAtomic(params: CreateSubmissionAtomicParams): Promise<{ submissionId: string; wasReplay: boolean }>;

  getSubmissionById(id: string): Promise<Submission | null>;
  getSubmissionFiles(submissionId: string): Promise<SubmissionFile[]>;
  listSubmissionsForAttempt(attemptId: string): Promise<Submission[]>;
  listSubmissionsForUser(userId: string): Promise<Submission[]>;

  /** Mirrors transition_submission_status(). Throws InvalidStateError if not in one of expectedCurrent. */
  transitionSubmissionStatus(
    submissionId: string,
    expectedCurrent: SubmissionStatus[],
    newStatus: SubmissionStatus,
    reason?: string,
  ): Promise<Submission>;

  /** Mirrors claim_next_evaluation_job(). Returns null when nothing is claimable. */
  claimNextEvaluationJob(workerId: string, leaseSeconds: number): Promise<EvaluationJob | null>;
  markEvaluationJobRunning(jobId: string, workerId: string): Promise<boolean>;
  extendEvaluationJobLease(jobId: string, workerId: string, leaseSeconds: number): Promise<boolean>;
  markEvaluationJobFailed(jobId: string, workerId: string, error: string): Promise<EvaluationJobStatus>;

  /** Mirrors finalize_evaluation(). Throws StaleClaimError if the caller no longer owns the claim. */
  finalizeEvaluation(params: FinalizeEvaluationParams): Promise<EvaluationResult>;

  getOfficialEvaluationResult(submissionId: string): Promise<EvaluationResult | null>;
  listEvaluationResultsForSubmission(submissionId: string): Promise<EvaluationResult[]>;

  /** Mirrors initiate_reevaluation(). Throws ForbiddenError / NotFoundError / InvalidStateError. */
  initiateReevaluation(params: { submissionId: string; actorId: string; actorRole: UserRole; reason: string }): Promise<EvaluationJob>;

  /** Mirrors recover_stuck_evaluation_jobs(). */
  recoverStuckEvaluationJobs(maxAgeSeconds: number): Promise<{ jobId: string; newStatus: EvaluationJobStatus; submissionId: string }[]>;

  recordAuditEvent(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<void>;
  listAuditEventsForSubmission(submissionId: string): Promise<AuditEvent[]>;

  // --- test/inspection-only helpers (present on the in-memory fake; the Supabase impl
  // implements them as thin queries too, but production code should rarely need them) ---
  _debugExpireLease?(jobId: string): Promise<void>;
}
