/**
 * CodeForge AI — Submission System
 * Role-aware DTOs. Note what's NOT here: there is no "strip the hidden fields before
 * sending to a student" logic anywhere in this file, because there's nothing to strip —
 * HiddenResult (domain/types.ts) is aggregate-only by construction, so the exact same
 * object is safe to hand to a student, an instructor, or an admin. What this file
 * actually gates is (a) whether the viewer may see the submission at all, and (b) the
 * strictly smaller set of worker/job-internal fields (claimed_by, lease timers, raw
 * audit log) that even authorized-staff-but-not-admin/author roles never see — mirrors
 * the evaluation_jobs / audit_events RLS policies in 0003_rls_policies.sql exactly.
 */
import type {
  AuditEvent,
  AuthenticatedActor,
  EvaluationJob,
  EvaluationResult,
  ReEvaluation,
  Submission,
  SubmissionFile,
} from '../domain/types.js';
import { ForbiddenError } from '../repository/submissionRepository.js';

export interface ViewerRelationship {
  isProblemAuthor: boolean;
  isInterviewerForAttempt: boolean;
}

const STAFF_ROLES = new Set(['instructor', 'admin', 'problem_author']);

export function canViewSubmission(viewer: AuthenticatedActor, submission: Submission, rel: ViewerRelationship): boolean {
  if (submission.userId === viewer.userId) return true;
  if (STAFF_ROLES.has(viewer.role)) return true;
  if (rel.isProblemAuthor) return true;
  if (viewer.role === 'interviewer' && rel.isInterviewerForAttempt) return true;
  return false;
}

/** Mirrors evaluation_jobs_admin_select / audit_events_admin_select — stricter than canViewSubmission. */
export function canViewAdminDebugInfo(viewer: AuthenticatedActor, rel: ViewerRelationship): boolean {
  return viewer.role === 'admin' || rel.isProblemAuthor;
}

/** Mirrors initiate_reevaluation()'s own role check — exposed here so the API layer can
 * return a clean 403 without a wasted round-trip, while the DB function remains the
 * authoritative enforcement point (defense in depth, not a replacement for it). */
export function canInitiateReevaluation(viewer: AuthenticatedActor): boolean {
  return viewer.role === 'admin' || viewer.role === 'instructor' || viewer.role === 'problem_author';
}

export function assertCanView(viewer: AuthenticatedActor, submission: Submission, rel: ViewerRelationship): void {
  if (!canViewSubmission(viewer, submission, rel)) {
    throw new ForbiddenError(`FORBIDDEN: user ${viewer.userId} may not view submission ${submission.id}`);
  }
}

export interface SubmissionStatusDTO {
  id: string;
  status: Submission['status'];
  submissionNumber: number;
  language: string;
  languageVersion: string;
  createdAt: string;
}

export function toSubmissionStatusDTO(s: Submission): SubmissionStatusDTO {
  return {
    id: s.id,
    status: s.status,
    submissionNumber: s.submissionNumber,
    language: s.language,
    languageVersion: s.languageVersion,
    createdAt: s.createdAt,
  };
}

export interface ReEvaluationSummaryDTO {
  reason: string;
  previousVerdict: string;
  previousScore: number;
  newVerdict: string | null;
  newScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

export function toReEvaluationSummaryDTO(re: ReEvaluation): ReEvaluationSummaryDTO {
  return {
    reason: re.reason,
    previousVerdict: re.previousVerdict,
    previousScore: re.previousScore,
    newVerdict: re.newVerdict,
    newScore: re.newScore,
    createdAt: re.createdAt,
    resolvedAt: re.resolvedAt,
  };
}

export interface SubmissionDetailDTO extends SubmissionStatusDTO {
  files: { filename: string; path: string; content: string; role: string }[];
  result: {
    verdict: EvaluationResult['verdict'];
    score: number;
    compilationStatus: EvaluationResult['compilationStatus'];
    compilationOutput: string | null;
    publicResult: EvaluationResult['publicResult'];
    hiddenResult: EvaluationResult['hiddenResult']; // already aggregate-only — see file header
    resourceUsage: EvaluationResult['resourceUsage'];
    terminationReason: string | null;
    finalizedAt: string;
  } | null; // null while the submission is still in flight — never fabricated partial data
  reEvaluations: ReEvaluationSummaryDTO[];
}

export function toSubmissionDetailDTO(
  submission: Submission,
  files: SubmissionFile[],
  officialResult: EvaluationResult | null,
  reEvaluations: ReEvaluation[],
): SubmissionDetailDTO {
  return {
    ...toSubmissionStatusDTO(submission),
    files: files.map((f) => ({ filename: f.filename, path: f.path, content: f.content, role: f.role })),
    result: officialResult
      ? {
          verdict: officialResult.verdict,
          score: officialResult.score,
          compilationStatus: officialResult.compilationStatus,
          compilationOutput: officialResult.compilationOutput,
          publicResult: {
            totalTests: officialResult.publicResult.totalTests,
            passed: officialResult.publicResult.passed,
            failed: officialResult.publicResult.failed,
            cases: officialResult.publicResult.cases.map((c) => ({ name: c.name, passed: c.passed, wallMs: c.wallMs })),
          },
          // Reconstructed field-by-field, not passed through by reference: even if a
          // malformed object somehow carried extra properties this far (a bug upstream,
          // a hand-edited row), only these four aggregate fields can ever reach the
          // client — there is no field here that could hold raw inputs/outputs/ids/weights.
          hiddenResult: {
            totalGroups: officialResult.hiddenResult.totalGroups,
            passedGroups: officialResult.hiddenResult.passedGroups,
            totalWeight: officialResult.hiddenResult.totalWeight,
            earnedWeight: officialResult.hiddenResult.earnedWeight,
          },
          resourceUsage: {
            cpuMs: officialResult.resourceUsage.cpuMs,
            memoryKb: officialResult.resourceUsage.memoryKb,
            wallMs: officialResult.resourceUsage.wallMs,
            outputBytes: officialResult.resourceUsage.outputBytes,
          },
          terminationReason: officialResult.terminationReason,
          finalizedAt: officialResult.finalizedAt,
        }
      : null,
    reEvaluations: reEvaluations.map(toReEvaluationSummaryDTO),
  };
}

export interface SubmissionHistoryRowDTO {
  id: string;
  submissionNumber: number;
  language: string;
  createdAt: string;
  status: Submission['status'];
  verdict: EvaluationResult['verdict'] | null;
  score: number | null;
}

export function toSubmissionHistoryRowDTO(submission: Submission, officialResult: EvaluationResult | null): SubmissionHistoryRowDTO {
  return {
    id: submission.id,
    submissionNumber: submission.submissionNumber,
    language: submission.language,
    createdAt: submission.createdAt,
    status: submission.status,
    verdict: officialResult?.verdict ?? null,
    score: officialResult?.score ?? null,
  };
}

/** Admin/problem-author only — mirrors evaluation_jobs + audit_events RLS. Never merged into SubmissionDetailDTO. */
export interface SubmissionAdminDebugDTO {
  job: {
    id: string;
    status: EvaluationJob['status'];
    claimedBy: string | null;
    attemptCount: number;
    lastError: string | null;
  } | null;
  auditEvents: { eventType: string; actorRole: string | null; correlationId: string; createdAt: string }[];
}

export function toAdminDebugDTO(job: EvaluationJob | null, auditEvents: AuditEvent[]): SubmissionAdminDebugDTO {
  return {
    job: job
      ? { id: job.id, status: job.status, claimedBy: job.claimedBy, attemptCount: job.attemptCount, lastError: job.lastError }
      : null,
    auditEvents: auditEvents.map((e) => ({ eventType: e.eventType, actorRole: e.actorRole, correlationId: e.correlationId, createdAt: e.createdAt })),
  };
}
