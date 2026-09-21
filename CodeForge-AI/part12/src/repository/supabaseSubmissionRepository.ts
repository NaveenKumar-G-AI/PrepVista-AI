/**
 * CodeForge AI — Submission System
 * =====================================================================================
 * NOT EXECUTED IN THIS SANDBOX. Written correctly and completely against the real
 * @supabase/supabase-js API surface, but this sandbox has no network access and
 * @supabase/supabase-js is not installed here (nothing is installable — see
 * ENGINEERING_REPORT.md, "Why zero-dependency"), so this file has never actually run
 * against a live Postgres/Supabase project. Every method below calls the matching
 * SECURITY DEFINER function from db/migrations/0002_functions.sql via .rpc(), which is
 * the same contract InMemorySubmissionRepository implements — that's what was actually
 * tested (tests/idempotency.test.ts, tests/workerLifecycle.test.ts,
 * tests/reEvaluation.test.ts, tests/endToEnd.test.ts, tests/api.test.ts).
 *
 * To activate this file in the real repo: `npm install @supabase/supabase-js`, fill in
 * .env from .env.example, and swap InMemorySubmissionRepository for
 * SupabaseSubmissionRepository wherever a SubmissionRepository is constructed (worker
 * main(), API route setup). Nothing else needs to change — every caller depends on the
 * SubmissionRepository interface, never on which implementation backs it.
 * =====================================================================================
 */
import type {
  Attempt,
  AuditEvent,
  EvaluationJob,
  EvaluationResult,
  Submission,
  SubmissionFile,
} from '../domain/types.js';
import type { EvaluationJobStatus, SubmissionMode, SubmissionStatus, UserRole } from '../domain/enums.js';
import {
  ForbiddenError,
  IdempotencyInFlightError,
  IdempotencyKeyReuseMismatchError,
  InvalidStateError,
  NotFoundError,
  QuotaExceededError,
  StaleClaimError,
  type CreateSubmissionAtomicParams,
  type FinalizeEvaluationParams,
  type SubmissionRepository,
} from './submissionRepository.js';

/** The minimal slice of @supabase/supabase-js's client this file depends on — declared
 * locally rather than imported, since the real package isn't installed in this sandbox.
 * A real deployment deletes this interface and imports SupabaseClient from the package
 * instead; the shape below matches its actual .rpc()/.from() surface. */
export interface PostgrestFilterBuilderLike {
  eq(column: string, value: unknown): PostgrestFilterBuilderLike;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
  order(column: string, opts: { ascending: boolean }): Promise<{ data: unknown[]; error: { message: string } | null }>;
}

export interface SupabaseClientLike {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  from(table: string): {
    select(columns: string): PostgrestFilterBuilderLike;
    insert(row: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

function mapPostgresError(error: { message: string; code?: string } | null, context: { jobId?: string; workerId?: string; key?: string; submissionId?: string; attemptId?: string; limit?: number }): Error | null {
  if (!error) return null;
  // Custom SQLSTATEs raised explicitly in 0002_functions.sql — mapped back to the same
  // typed error classes the in-memory repository throws, so callers (services/api/
  // worker) never need to know which repository implementation is behind the interface.
  switch (error.code) {
    case 'P0001':
      return new StaleClaimError(context.jobId ?? 'unknown', context.workerId ?? 'unknown');
    case 'P0002':
      return new IdempotencyKeyReuseMismatchError(context.key ?? 'unknown');
    case 'P0003':
      return new IdempotencyInFlightError(context.key ?? 'unknown');
    case 'P0004':
      return new QuotaExceededError(context.attemptId ?? 'unknown', context.limit ?? 0);
    case 'P0005':
      return new ForbiddenError(error.message);
    case 'P0006':
      return new NotFoundError(error.message);
    case 'P0007':
    case 'P0008':
      return new InvalidStateError(error.message);
    default:
      return new Error(`SUPABASE_RPC_ERROR: ${error.message}`);
  }
}

// --- row <-> domain mapping (snake_case DB columns <-> camelCase domain types) ---

function mapSubmissionRow(row: Record<string, unknown>): Submission {
  return {
    id: row.id as string,
    attemptId: row.attempt_id as string,
    userId: row.user_id as string,
    problemId: row.problem_id as string,
    assessmentId: (row.assessment_id as string) ?? null,
    mode: row.mode as SubmissionMode,
    problemVersionId: row.problem_version_id as string,
    testSuiteVersionId: row.test_suite_version_id as string,
    checkerVersionId: row.checker_version_id as string,
    executionConfigSnapshot: row.execution_config_snapshot as Submission['executionConfigSnapshot'],
    language: row.language as string,
    languageVersion: row.language_version as string,
    sourceFingerprint: row.source_fingerprint as string,
    totalSourceBytes: row.total_source_bytes as number,
    fileCount: row.file_count as number,
    status: row.status as SubmissionStatus,
    currentEvaluationResultId: (row.current_evaluation_result_id as string) ?? null,
    idempotencyKey: row.idempotency_key as string,
    submissionNumber: row.submission_number as number,
    serverReceivedAt: row.server_received_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapEvaluationResultRow(row: Record<string, unknown>): EvaluationResult {
  return {
    id: row.id as string,
    evaluationJobId: row.evaluation_job_id as string,
    submissionId: row.submission_id as string,
    compilationStatus: row.compilation_status as EvaluationResult['compilationStatus'],
    compilationOutput: (row.compilation_output as string) ?? null,
    publicResult: row.public_result as EvaluationResult['publicResult'],
    hiddenResult: row.hidden_result as EvaluationResult['hiddenResult'],
    resourceUsage: row.resource_usage as EvaluationResult['resourceUsage'],
    verdict: row.verdict as EvaluationResult['verdict'],
    score: Number(row.score),
    terminationReason: (row.termination_reason as string) ?? null,
    isOfficial: row.is_official as boolean,
    finalizedAt: row.finalized_at as string,
    createdAt: row.created_at as string,
  };
}

function mapEvaluationJobRow(row: Record<string, unknown>): EvaluationJob {
  return {
    id: row.id as string,
    submissionId: row.submission_id as string,
    kind: row.kind as EvaluationJob['kind'],
    status: row.status as EvaluationJobStatus,
    priority: row.priority as number,
    claimedBy: (row.claimed_by as string) ?? null,
    claimedAt: (row.claimed_at as string) ?? null,
    leaseExpiresAt: (row.lease_expires_at as string) ?? null,
    attemptCount: row.attempt_count as number,
    maxAttempts: row.max_attempts as number,
    lastError: (row.last_error as string) ?? null,
    reevaluationReason: (row.reevaluation_reason as string) ?? null,
    reevaluationActorId: (row.reevaluation_actor_id as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class SupabaseSubmissionRepository implements SubmissionRepository {
  constructor(private readonly client: SupabaseClientLike) {}

  async createAttempt(input: { userId: string; problemId: string; assessmentId: string | null; mode: SubmissionMode }): Promise<Attempt> {
    const { data, error } = await this.client.from('attempts').insert({ user_id: input.userId, problem_id: input.problemId, assessment_id: input.assessmentId, mode: input.mode });
    if (error) throw new Error(`SUPABASE_INSERT_ERROR: ${error.message}`);
    const row = data as Record<string, unknown>;
    return { id: row.id as string, userId: input.userId, problemId: input.problemId, assessmentId: input.assessmentId, mode: input.mode, startedAt: row.started_at as string, createdAt: row.created_at as string };
  }

  async getAttemptById(id: string): Promise<Attempt | null> {
    const { data, error } = await this.client.from('attempts').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`SUPABASE_SELECT_ERROR: ${error.message}`);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      userId: row.user_id as string,
      problemId: row.problem_id as string,
      assessmentId: (row.assessment_id as string) ?? null,
      mode: row.mode as SubmissionMode,
      startedAt: row.started_at as string,
      createdAt: row.created_at as string,
    };
  }

  async createSubmissionAtomic(params: CreateSubmissionAtomicParams): Promise<{ submissionId: string; wasReplay: boolean }> {
    const { data, error } = await this.client.rpc('create_submission_atomic', {
      p_user_id: params.userId,
      p_attempt_id: params.attemptId,
      p_problem_id: params.problemId,
      p_assessment_id: params.assessmentId,
      p_mode: params.mode,
      p_problem_version_id: params.problemVersionId,
      p_test_suite_version_id: params.testSuiteVersionId,
      p_checker_version_id: params.checkerVersionId,
      p_execution_config: params.executionConfigSnapshot,
      p_language: params.language,
      p_language_version: params.languageVersion,
      p_source_fingerprint: params.sourceFingerprint,
      p_total_source_bytes: params.totalSourceBytes,
      p_files: params.files,
      p_idempotency_key: params.idempotencyKey,
      p_request_fingerprint: params.requestFingerprint,
      p_max_submissions_per_attempt: params.maxSubmissionsPerAttempt,
    });
    const mapped = mapPostgresError(error, { key: params.idempotencyKey, attemptId: params.attemptId, limit: params.maxSubmissionsPerAttempt ?? undefined });
    if (mapped) throw mapped;
    const row = (data as Record<string, unknown>[])[0] as Record<string, unknown>;
    return { submissionId: row.out_submission_id as string, wasReplay: row.out_was_replay as boolean };
  }

  async getSubmissionById(id: string): Promise<Submission | null> {
    const { data, error } = await this.client.from('submissions').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`SUPABASE_SELECT_ERROR: ${error.message}`);
    return data ? mapSubmissionRow(data as Record<string, unknown>) : null;
  }

  async getSubmissionFiles(submissionId: string): Promise<SubmissionFile[]> {
    const { data, error } = await this.client.from('submission_files').select('*').eq('submission_id', submissionId).order('ordinal', { ascending: true });
    if (error) throw new Error(`SUPABASE_SELECT_ERROR: ${error.message}`);
    return (data as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      submissionId: row.submission_id as string,
      filename: row.filename as string,
      path: row.path as string,
      content: row.content as string,
      sizeBytes: row.size_bytes as number,
      sha256: row.sha256 as string,
      role: row.role as SubmissionFile['role'],
      ordinal: row.ordinal as number,
      createdAt: row.created_at as string,
    }));
  }

  async listSubmissionsForAttempt(attemptId: string): Promise<Submission[]> {
    const { data, error } = await this.client.from('submissions').select('*').eq('attempt_id', attemptId).order('submission_number', { ascending: true });
    if (error) throw new Error(`SUPABASE_SELECT_ERROR: ${error.message}`);
    return (data as Record<string, unknown>[]).map(mapSubmissionRow);
  }

  async listSubmissionsForUser(userId: string): Promise<Submission[]> {
    const { data, error } = await this.client.from('submissions').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw new Error(`SUPABASE_SELECT_ERROR: ${error.message}`);
    return (data as Record<string, unknown>[]).map(mapSubmissionRow);
  }

  async transitionSubmissionStatus(submissionId: string, expectedCurrent: SubmissionStatus[], newStatus: SubmissionStatus, reason?: string): Promise<Submission> {
    const { data, error } = await this.client.rpc('transition_submission_status', {
      p_submission_id: submissionId,
      p_expected_current: expectedCurrent,
      p_new_status: newStatus,
      p_reason: reason ?? null,
    });
    const mapped = mapPostgresError(error, { submissionId });
    if (mapped) throw mapped;
    return mapSubmissionRow(data as Record<string, unknown>);
  }

  async claimNextEvaluationJob(workerId: string, leaseSeconds: number): Promise<EvaluationJob | null> {
    const { data, error } = await this.client.rpc('claim_next_evaluation_job', { p_worker_id: workerId, p_lease_seconds: leaseSeconds });
    if (error) throw new Error(`SUPABASE_RPC_ERROR: ${error.message}`);
    const row = data as Record<string, unknown> | null;
    if (!row || !row.id) return null;
    return mapEvaluationJobRow(row);
  }

  async markEvaluationJobRunning(jobId: string, workerId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('mark_evaluation_job_running', { p_job_id: jobId, p_worker_id: workerId });
    if (error) throw new Error(`SUPABASE_RPC_ERROR: ${error.message}`);
    return data as boolean;
  }

  async extendEvaluationJobLease(jobId: string, workerId: string, leaseSeconds: number): Promise<boolean> {
    const { data, error } = await this.client.rpc('extend_evaluation_job_lease', { p_job_id: jobId, p_worker_id: workerId, p_lease_seconds: leaseSeconds });
    if (error) throw new Error(`SUPABASE_RPC_ERROR: ${error.message}`);
    return data as boolean;
  }

  async markEvaluationJobFailed(jobId: string, workerId: string, error_: string): Promise<EvaluationJobStatus> {
    const { data, error } = await this.client.rpc('mark_evaluation_job_failed', { p_job_id: jobId, p_worker_id: workerId, p_error: error_ });
    const mapped = mapPostgresError(error, { jobId, workerId });
    if (mapped) throw mapped;
    return data as EvaluationJobStatus;
  }

  async finalizeEvaluation(params: FinalizeEvaluationParams): Promise<EvaluationResult> {
    const { data, error } = await this.client.rpc('finalize_evaluation', {
      p_job_id: params.jobId,
      p_worker_id: params.workerId,
      p_compilation_status: params.compilationStatus,
      p_compilation_output: params.compilationOutput,
      p_public_result: params.publicResult,
      p_hidden_result: params.hiddenResult,
      p_resource_usage: params.resourceUsage,
      p_verdict: params.verdict,
      p_score: params.score,
      p_termination_reason: params.terminationReason,
    });
    const mapped = mapPostgresError(error, { jobId: params.jobId, workerId: params.workerId });
    if (mapped) throw mapped;
    return mapEvaluationResultRow(data as Record<string, unknown>);
  }

  async getOfficialEvaluationResult(submissionId: string): Promise<EvaluationResult | null> {
    const { data, error } = await this.client.from('evaluation_results').select('*').eq('submission_id', submissionId).eq('is_official', true).maybeSingle();
    if (error) throw new Error(`SUPABASE_SELECT_ERROR: ${error.message}`);
    return data ? mapEvaluationResultRow(data as Record<string, unknown>) : null;
  }

  async listEvaluationResultsForSubmission(submissionId: string): Promise<EvaluationResult[]> {
    const { data, error } = await this.client.from('evaluation_results').select('*').eq('submission_id', submissionId).order('created_at', { ascending: true });
    if (error) throw new Error(`SUPABASE_SELECT_ERROR: ${error.message}`);
    return (data as Record<string, unknown>[]).map(mapEvaluationResultRow);
  }

  async initiateReevaluation(params: { submissionId: string; actorId: string; actorRole: UserRole; reason: string }): Promise<EvaluationJob> {
    const { data, error } = await this.client.rpc('initiate_reevaluation', {
      p_submission_id: params.submissionId,
      p_actor_id: params.actorId,
      p_actor_role: params.actorRole,
      p_reason: params.reason,
    });
    const mapped = mapPostgresError(error, { submissionId: params.submissionId });
    if (mapped) throw mapped;
    return mapEvaluationJobRow(data as Record<string, unknown>);
  }

  async recoverStuckEvaluationJobs(maxAgeSeconds: number): Promise<{ jobId: string; newStatus: EvaluationJobStatus; submissionId: string }[]> {
    const { data, error } = await this.client.rpc('recover_stuck_evaluation_jobs', { p_max_age_seconds: maxAgeSeconds });
    if (error) throw new Error(`SUPABASE_RPC_ERROR: ${error.message}`);
    return (data as Record<string, unknown>[]).map((row) => ({ jobId: row.job_id as string, newStatus: row.new_status as EvaluationJobStatus, submissionId: row.submission_id as string }));
  }

  async recordAuditEvent(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<void> {
    const { error } = await this.client.from('audit_events').insert({
      event_type: event.eventType,
      actor_id: event.actorId,
      actor_role: event.actorRole,
      submission_id: event.submissionId,
      evaluation_job_id: event.evaluationJobId,
      correlation_id: event.correlationId,
      metadata: event.metadata,
    });
    if (error) throw new Error(`SUPABASE_INSERT_ERROR: ${error.message}`);
  }

  async listAuditEventsForSubmission(submissionId: string): Promise<AuditEvent[]> {
    const { data, error } = await this.client.from('audit_events').select('*').eq('submission_id', submissionId).order('created_at', { ascending: true });
    if (error) throw new Error(`SUPABASE_SELECT_ERROR: ${error.message}`);
    return (data as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      eventType: row.event_type as string,
      actorId: (row.actor_id as string) ?? null,
      actorRole: (row.actor_role as UserRole) ?? null,
      submissionId: (row.submission_id as string) ?? null,
      evaluationJobId: (row.evaluation_job_id as string) ?? null,
      correlationId: row.correlation_id as string,
      metadata: row.metadata as Record<string, unknown>,
      createdAt: row.created_at as string,
    }));
  }
}
