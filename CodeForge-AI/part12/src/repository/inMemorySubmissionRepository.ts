/**
 * CodeForge AI — Submission System
 * Test double for Postgres. This is NOT a simplification that happens to pass tests
 * because Node is single-threaded — it uses real async mutexes (src/domain/
 * asyncUtils.ts) around exactly the sections the SQL functions protect with row locks
 * / unique constraints / transactions, so that firing genuinely-concurrent calls at it
 * (Promise.all) exercises the same race conditions a real duplicate-request or
 * duplicate-worker scenario would. See tests/idempotency.test.ts and
 * tests/workerClaiming.test.ts, which rely on that fidelity.
 *
 * Every method here has a named counterpart in db/migrations/0002_functions.sql —
 * that's intentional, not incidental, since src/repository/supabaseSubmissionRepository.ts
 * calls those functions by the exact same names via RPC.
 */
import { randomUUID } from 'node:crypto';
import type {
  Attempt,
  AuditEvent,
  EvaluationJob,
  EvaluationResult,
  ReEvaluation,
  Submission,
  SubmissionFile,
} from '../domain/types.js';
import type { EvaluationJobStatus, SubmissionMode, SubmissionStatus, UserRole } from '../domain/enums.js';
import { Mutex, KeyedMutexRegistry, sleep } from '../domain/asyncUtils.js';
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

interface IdempotencyRecord {
  id: string;
  userId: string;
  attemptId: string;
  key: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  submissionId: string | null;
  requestFingerprint: string;
  createdAt: string;
  completedAt: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface InMemoryRepositoryOptions {
  /** Widens the race window between "claim idempotency slot" and "do the work" so
   * concurrency tests reliably exercise the IN_FLIGHT branch instead of depending on
   * incidental microtask timing. 0 for fast non-race tests. */
  artificialLatencyMs?: number;
}

export class InMemorySubmissionRepository implements SubmissionRepository {
  private attempts = new Map<string, Attempt>();
  private submissions = new Map<string, Submission>();
  private submissionFiles = new Map<string, SubmissionFile[]>();
  private idempotencyKeys = new Map<string, IdempotencyRecord>();
  private evaluationJobs = new Map<string, EvaluationJob>();
  private evaluationResults = new Map<string, EvaluationResult>();
  private reEvaluations = new Map<string, ReEvaluation>();
  private auditEvents: AuditEvent[] = [];

  private readonly idempotencyMutex = new Mutex();
  private readonly jobsMutex = new Mutex();
  private readonly attemptMutexes = new KeyedMutexRegistry();
  private readonly artificialLatencyMs: number;

  constructor(options: InMemoryRepositoryOptions = {}) {
    this.artificialLatencyMs = options.artificialLatencyMs ?? 2;
  }

  async createAttempt(input: { userId: string; problemId: string; assessmentId: string | null; mode: SubmissionMode }): Promise<Attempt> {
    const attempt: Attempt = {
      id: randomUUID(),
      userId: input.userId,
      problemId: input.problemId,
      assessmentId: input.assessmentId,
      mode: input.mode,
      startedAt: nowIso(),
      createdAt: nowIso(),
    };
    this.attempts.set(attempt.id, attempt);
    return { ...attempt };
  }

  async getAttemptById(id: string): Promise<Attempt | null> {
    const a = this.attempts.get(id);
    return a ? { ...a } : null;
  }

  async createSubmissionAtomic(
    params: CreateSubmissionAtomicParams,
  ): Promise<{ submissionId: string; wasReplay: boolean }> {
    const idemMapKey = `${params.userId}::${params.idempotencyKey}`;

    const claim = await this.idempotencyMutex.runExclusive(() => {
      let record = this.idempotencyKeys.get(idemMapKey);
      if (!record) {
        record = {
          id: randomUUID(),
          userId: params.userId,
          attemptId: params.attemptId,
          key: params.idempotencyKey,
          status: 'PENDING',
          submissionId: null,
          requestFingerprint: params.requestFingerprint,
          createdAt: nowIso(),
          completedAt: null,
        };
        this.idempotencyKeys.set(idemMapKey, record);
        return { record: { ...record }, isNewOwner: true };
      }
      return { record: { ...record }, isNewOwner: false };
    });

    if (!claim.isNewOwner) {
      if (claim.record.requestFingerprint !== params.requestFingerprint) {
        throw new IdempotencyKeyReuseMismatchError(params.idempotencyKey);
      }
      if (claim.record.status === 'COMPLETED' && claim.record.submissionId) {
        return { submissionId: claim.record.submissionId, wasReplay: true };
      }
      if (claim.record.status === 'PENDING') {
        throw new IdempotencyInFlightError(params.idempotencyKey);
      }
      // FAILED: reclaim and retry.
      await this.idempotencyMutex.runExclusive(() => {
        const r = this.idempotencyKeys.get(idemMapKey);
        if (r) r.status = 'PENDING';
      });
    }

    if (this.artificialLatencyMs > 0) await sleep(this.artificialLatencyMs);

    const attemptMutex = this.attemptMutexes.get(params.attemptId);
    try {
      const submissionId = await attemptMutex.runExclusive(() => {
        const existingForAttempt = [...this.submissions.values()].filter((s) => s.attemptId === params.attemptId);

        if (params.maxSubmissionsPerAttempt !== null && existingForAttempt.length >= params.maxSubmissionsPerAttempt) {
          throw new QuotaExceededError(params.attemptId, params.maxSubmissionsPerAttempt);
        }

        const submissionNumber = existingForAttempt.length + 1;
        const id = randomUUID();
        const ts = nowIso();

        const submission: Submission = {
          id,
          attemptId: params.attemptId,
          userId: params.userId,
          problemId: params.problemId,
          assessmentId: params.assessmentId,
          mode: params.mode,
          problemVersionId: params.problemVersionId,
          testSuiteVersionId: params.testSuiteVersionId,
          checkerVersionId: params.checkerVersionId,
          executionConfigSnapshot: params.executionConfigSnapshot,
          language: params.language,
          languageVersion: params.languageVersion,
          sourceFingerprint: params.sourceFingerprint,
          totalSourceBytes: params.totalSourceBytes,
          fileCount: params.files.length,
          status: 'QUEUED',
          currentEvaluationResultId: null,
          idempotencyKey: params.idempotencyKey,
          submissionNumber,
          serverReceivedAt: ts,
          createdAt: ts,
          updatedAt: ts,
        };
        this.submissions.set(id, submission);

        const files: SubmissionFile[] = params.files.map((f, idx) => ({
          id: randomUUID(),
          submissionId: id,
          filename: f.filename,
          path: f.path,
          content: f.content,
          sizeBytes: f.sizeBytes,
          sha256: f.sha256,
          role: f.role as SubmissionFile['role'],
          ordinal: f.ordinal ?? idx,
          createdAt: ts,
        }));
        this.submissionFiles.set(id, files);

        const job: EvaluationJob = {
          id: randomUUID(),
          submissionId: id,
          kind: 'INITIAL',
          status: 'QUEUED',
          priority: params.mode === 'INTERVIEW' ? 50 : 100,
          claimedBy: null,
          claimedAt: null,
          leaseExpiresAt: null,
          attemptCount: 0,
          maxAttempts: 3,
          lastError: null,
          reevaluationReason: null,
          reevaluationActorId: null,
          createdAt: ts,
          updatedAt: ts,
        };
        this.evaluationJobs.set(job.id, job);

        return id;
      });

      await this.idempotencyMutex.runExclusive(() => {
        const r = this.idempotencyKeys.get(idemMapKey);
        if (r) {
          r.status = 'COMPLETED';
          r.submissionId = submissionId;
          r.completedAt = nowIso();
        }
      });

      return { submissionId, wasReplay: false };
    } catch (err) {
      await this.idempotencyMutex.runExclusive(() => {
        const r = this.idempotencyKeys.get(idemMapKey);
        if (r) r.status = 'FAILED';
      });
      throw err;
    }
  }

  async getSubmissionById(id: string): Promise<Submission | null> {
    const s = this.submissions.get(id);
    return s ? { ...s } : null;
  }

  async getSubmissionFiles(submissionId: string): Promise<SubmissionFile[]> {
    return [...(this.submissionFiles.get(submissionId) ?? [])];
  }

  async listSubmissionsForAttempt(attemptId: string): Promise<Submission[]> {
    return [...this.submissions.values()]
      .filter((s) => s.attemptId === attemptId)
      .sort((a, b) => a.submissionNumber - b.submissionNumber);
  }

  async listSubmissionsForUser(userId: string): Promise<Submission[]> {
    return [...this.submissions.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async transitionSubmissionStatus(
    submissionId: string,
    expectedCurrent: SubmissionStatus[],
    newStatus: SubmissionStatus,
    _reason?: string,
  ): Promise<Submission> {
    return this.jobsMutex.runExclusive(() => {
      const submission = this.submissions.get(submissionId);
      if (!submission || !expectedCurrent.includes(submission.status)) {
        throw new InvalidStateError(
          `INVALID_TRANSITION: submission ${submissionId} is not in one of ${expectedCurrent.join(',')} (actual: ${submission?.status ?? 'NOT_FOUND'})`,
        );
      }
      submission.status = newStatus;
      submission.updatedAt = nowIso();
      return { ...submission };
    });
  }

  async claimNextEvaluationJob(workerId: string, leaseSeconds: number): Promise<EvaluationJob | null> {
    return this.jobsMutex.runExclusive(() => {
      const now = Date.now();
      const candidates = [...this.evaluationJobs.values()]
        .filter(
          (j) =>
            j.status === 'QUEUED' ||
            ((j.status === 'CLAIMED' || j.status === 'RUNNING') && j.leaseExpiresAt !== null && new Date(j.leaseExpiresAt).getTime() < now),
        )
        .sort((a, b) => a.priority - b.priority || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const job = candidates[0];
      if (!job) return null;

      job.status = 'CLAIMED';
      job.claimedBy = workerId;
      job.claimedAt = new Date(now).toISOString();
      job.leaseExpiresAt = new Date(now + leaseSeconds * 1000).toISOString();
      job.attemptCount += 1;
      job.updatedAt = new Date(now).toISOString();
      return { ...job };
    });
  }

  async markEvaluationJobRunning(jobId: string, workerId: string): Promise<boolean> {
    return this.jobsMutex.runExclusive(() => {
      const job = this.evaluationJobs.get(jobId);
      if (!job || job.claimedBy !== workerId || job.status !== 'CLAIMED') return false;
      job.status = 'RUNNING';
      job.updatedAt = nowIso();
      return true;
    });
  }

  async extendEvaluationJobLease(jobId: string, workerId: string, leaseSeconds: number): Promise<boolean> {
    return this.jobsMutex.runExclusive(() => {
      const job = this.evaluationJobs.get(jobId);
      if (!job || job.claimedBy !== workerId || (job.status !== 'CLAIMED' && job.status !== 'RUNNING')) return false;
      job.leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
      job.updatedAt = nowIso();
      return true;
    });
  }

  async markEvaluationJobFailed(jobId: string, workerId: string, error: string): Promise<EvaluationJobStatus> {
    return this.jobsMutex.runExclusive(() => {
      const job = this.evaluationJobs.get(jobId);
      if (!job || job.claimedBy !== workerId || (job.status !== 'CLAIMED' && job.status !== 'RUNNING')) {
        throw new StaleClaimError(jobId, workerId);
      }
      job.status = job.attemptCount >= job.maxAttempts ? 'DEAD_LETTER' : 'QUEUED';
      job.claimedBy = null;
      job.claimedAt = null;
      job.leaseExpiresAt = null;
      job.lastError = error;
      job.updatedAt = nowIso();
      return job.status;
    });
  }

  async finalizeEvaluation(params: FinalizeEvaluationParams): Promise<EvaluationResult> {
    return this.jobsMutex.runExclusive(() => {
      const job = this.evaluationJobs.get(params.jobId);
      if (!job || job.claimedBy !== params.workerId || (job.status !== 'CLAIMED' && job.status !== 'RUNNING')) {
        throw new StaleClaimError(params.jobId, params.workerId);
      }
      job.status = 'DONE';
      job.updatedAt = nowIso();

      for (const r of this.evaluationResults.values()) {
        if (r.submissionId === job.submissionId && r.isOfficial) r.isOfficial = false;
      }

      const ts = nowIso();
      const result: EvaluationResult = {
        id: randomUUID(),
        evaluationJobId: job.id,
        submissionId: job.submissionId,
        compilationStatus: params.compilationStatus,
        compilationOutput: params.compilationOutput,
        publicResult: params.publicResult,
        hiddenResult: params.hiddenResult,
        resourceUsage: params.resourceUsage,
        verdict: params.verdict,
        score: params.score,
        terminationReason: params.terminationReason,
        isOfficial: true,
        finalizedAt: ts,
        createdAt: ts,
      };
      this.evaluationResults.set(result.id, result);

      const submission = this.submissions.get(job.submissionId);
      if (submission) {
        submission.status = params.verdict === 'JUDGE_ERROR' ? 'JUDGE_ERROR' : 'COMPLETED';
        submission.currentEvaluationResultId = result.id;
        submission.updatedAt = ts;
      }

      for (const re of this.reEvaluations.values()) {
        if (re.newEvaluationJobId === job.id) {
          re.newEvaluationResultId = result.id;
          re.newVerdict = result.verdict;
          re.newScore = result.score;
          re.resolvedAt = ts;
        }
      }

      return { ...result };
    });
  }

  async getOfficialEvaluationResult(submissionId: string): Promise<EvaluationResult | null> {
    const found = [...this.evaluationResults.values()].find((r) => r.submissionId === submissionId && r.isOfficial);
    return found ? { ...found } : null;
  }

  async listEvaluationResultsForSubmission(submissionId: string): Promise<EvaluationResult[]> {
    return [...this.evaluationResults.values()]
      .filter((r) => r.submissionId === submissionId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async initiateReevaluation(params: {
    submissionId: string;
    actorId: string;
    actorRole: UserRole;
    reason: string;
  }): Promise<EvaluationJob> {
    return this.jobsMutex.runExclusive(() => {
      if (!['admin', 'instructor', 'problem_author'].includes(params.actorRole)) {
        throw new ForbiddenError(`FORBIDDEN: role ${params.actorRole} is not authorized to initiate re-evaluation`);
      }
      const submission = this.submissions.get(params.submissionId);
      if (!submission) {
        throw new NotFoundError(`NOT_FOUND: submission ${params.submissionId} does not exist`);
      }
      if (submission.status !== 'COMPLETED' && submission.status !== 'JUDGE_ERROR') {
        throw new InvalidStateError(
          `INVALID_STATE: submission ${params.submissionId} is still in flight (status=${submission.status}), cannot re-evaluate yet`,
        );
      }
      const currentResult = [...this.evaluationResults.values()].find((r) => r.submissionId === params.submissionId && r.isOfficial);
      if (!currentResult) {
        throw new InvalidStateError(`INVALID_STATE: submission ${params.submissionId} has no official result to re-evaluate`);
      }

      const ts = nowIso();
      const job: EvaluationJob = {
        id: randomUUID(),
        submissionId: params.submissionId,
        kind: 'REEVALUATION',
        status: 'QUEUED',
        priority: 40,
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
        attemptCount: 0,
        maxAttempts: 3,
        lastError: null,
        reevaluationReason: params.reason,
        reevaluationActorId: params.actorId,
        createdAt: ts,
        updatedAt: ts,
      };
      this.evaluationJobs.set(job.id, job);

      const re: ReEvaluation = {
        id: randomUUID(),
        submissionId: params.submissionId,
        previousEvaluationResultId: currentResult.id,
        newEvaluationResultId: null,
        newEvaluationJobId: job.id,
        reason: params.reason,
        actorId: params.actorId,
        actorRole: params.actorRole,
        previousVerdict: currentResult.verdict,
        previousScore: currentResult.score,
        newVerdict: null,
        newScore: null,
        createdAt: ts,
        resolvedAt: null,
      };
      this.reEvaluations.set(re.id, re);

      submission.status = 'QUEUED';
      submission.updatedAt = ts;

      return { ...job };
    });
  }

  async recoverStuckEvaluationJobs(
    maxAgeSeconds: number,
  ): Promise<{ jobId: string; newStatus: EvaluationJobStatus; submissionId: string }[]> {
    return this.jobsMutex.runExclusive(() => {
      const now = Date.now();
      const recovered: { jobId: string; newStatus: EvaluationJobStatus; submissionId: string }[] = [];

      for (const job of this.evaluationJobs.values()) {
        const leaseExpired = (job.status === 'CLAIMED' || job.status === 'RUNNING') && job.leaseExpiresAt !== null && new Date(job.leaseExpiresAt).getTime() < now;
        if (!leaseExpired) continue;

        const ageSeconds = (now - new Date(job.createdAt).getTime()) / 1000;
        const newStatus: EvaluationJobStatus = job.attemptCount >= job.maxAttempts || ageSeconds > maxAgeSeconds ? 'DEAD_LETTER' : 'QUEUED';

        job.status = newStatus;
        job.claimedBy = null;
        job.claimedAt = null;
        job.leaseExpiresAt = null;
        job.lastError = `${job.lastError ? job.lastError + '; ' : ''}recovered at ${new Date(now).toISOString()}: lease expired`;
        job.updatedAt = new Date(now).toISOString();

        recovered.push({ jobId: job.id, newStatus, submissionId: job.submissionId });
      }
      return recovered;
    });
  }

  async recordAuditEvent(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<void> {
    this.auditEvents.push({ ...event, id: randomUUID(), createdAt: nowIso() });
  }

  async listAuditEventsForSubmission(submissionId: string): Promise<AuditEvent[]> {
    return this.auditEvents.filter((e) => e.submissionId === submissionId);
  }

  /** Test-only: force a job's lease into the past, to simulate a crashed/zombie worker without waiting real time. */
  async _debugExpireLease(jobId: string): Promise<void> {
    await this.jobsMutex.runExclusive(() => {
      const job = this.evaluationJobs.get(jobId);
      if (job) job.leaseExpiresAt = new Date(Date.now() - 1000).toISOString();
    });
  }
}
