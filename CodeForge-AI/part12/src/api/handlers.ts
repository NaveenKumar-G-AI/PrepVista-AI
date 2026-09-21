/**
 * CodeForge AI — Submission System
 * API handlers. Deliberately framework-agnostic: each function takes a plain request
 * object and an already-authenticated actor, and returns a plain { status, body }
 * response — no Express/Next.js Request/Response types anywhere. Wiring this into
 * CodeForge's actual HTTP layer is a thin adapter (see the comment at the bottom of
 * this file), not a rewrite, and it means these handlers are unit-testable by calling
 * them directly (see tests/api.test.ts) without an HTTP server.
 *
 * Every handler resolves `actor` from the server-side session BEFORE calling into any
 * of these — none of them ever accept a client-supplied user id, role, or ownership
 * field as authoritative. That resolution is intentionally the caller's job (the real
 * HTTP layer's auth middleware), matching "never trust client-provided user ID."
 */
import { randomUUID } from 'node:crypto';
import type { SubmissionRepository } from '../repository/submissionRepository.js';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../repository/submissionRepository.js';
import { submitCode, type SubmitCodeDependencies } from '../services/submissionService.js';
import { ValidationError } from '../services/validation.js';
import {
  assertCanView,
  canInitiateReevaluation,
  canViewAdminDebugInfo,
  toAdminDebugDTO,
  toSubmissionDetailDTO,
  toSubmissionHistoryRowDTO,
  toSubmissionStatusDTO,
  type ViewerRelationship,
} from '../services/dto.js';
import type { TokenBucketRateLimiter } from '../services/rateLimiter.js';
import type { AuthenticatedActor, SubmissionRequest } from '../domain/types.js';

export interface ApiResponse<T> {
  status: number;
  body: T | { error: string; code: string };
}

function errorResponse(status: number, code: string, message: string): ApiResponse<never> {
  // Human-readable, never a stack trace / internal path / db error — see spec, "ERROR UX."
  return { status, body: { error: message, code } };
}

function handleKnownError(err: unknown): ApiResponse<never> | null {
  if (err instanceof ValidationError) return errorResponse(400, err.code, err.message);
  if (err instanceof ForbiddenError) return errorResponse(403, 'FORBIDDEN', 'You are not authorized to perform this action.');
  if (err instanceof NotFoundError) return errorResponse(404, 'NOT_FOUND', 'The requested resource was not found.');
  if (err instanceof InvalidStateError) return errorResponse(409, 'INVALID_STATE', err.message);
  return null;
}

/** A best-effort relationship resolver is injected rather than hard-coded — whether a
 * viewer is a problem author or an assigned interviewer depends on CodeForge's existing
 * problem-authorship and interview-assignment tables, which this module doesn't own. */
export interface RelationshipResolver {
  resolve(viewer: AuthenticatedActor, submissionId: string): Promise<ViewerRelationship>;
}

// ---------------------------------------------------------------------------
// POST /submissions
// ---------------------------------------------------------------------------
export interface CreateSubmissionHttpRequest {
  actor: AuthenticatedActor;
  ipAddress: string;
  body: SubmissionRequest;
}

export async function handleCreateSubmission(
  deps: SubmitCodeDependencies & { rateLimiters: { perUser: TokenBucketRateLimiter; perIp: TokenBucketRateLimiter } },
  req: CreateSubmissionHttpRequest,
): Promise<ApiResponse<{ submissionId: string }>> {
  if (!deps.rateLimiters.perUser.tryConsume(`user:${req.actor.userId}`)) {
    return errorResponse(429, 'RATE_LIMITED', 'Too many submissions. Please wait before submitting again.');
  }
  if (!deps.rateLimiters.perIp.tryConsume(`ip:${req.ipAddress}`)) {
    return errorResponse(429, 'RATE_LIMITED', 'Too many submissions from this network. Please wait before submitting again.');
  }

  try {
    const result = await submitCode(deps, {
      actor: req.actor,
      request: req.body,
      clientRequestFingerprint: computeRequestFingerprint(req.body),
    });
    return { status: result.wasReplay ? 200 : 201, body: { submissionId: result.submissionId } };
  } catch (err) {
    const known = handleKnownError(err);
    if (known) return known;
    // Anything else is a platform problem, not a validation rejection — never surface
    // the raw error to the client (see ERROR UX in the spec).
    return errorResponse(503, 'SUBMISSION_SERVICE_UNAVAILABLE', 'The submission service could not process this request right now. Please try again.');
  }
}

function computeRequestFingerprint(body: SubmissionRequest): string {
  // A real implementation hashes the full logical body (files + language + attemptId);
  // reusing the source fingerprint machinery keeps this file free of a second hashing
  // implementation. See hashing.ts.
  return JSON.stringify({ attemptId: body.attemptId, language: body.language, languageVersion: body.languageVersion, files: body.files.map((f) => [f.path, f.content]) });
}

// ---------------------------------------------------------------------------
// GET /submissions/:id  (status while in flight, full detail once terminal)
// ---------------------------------------------------------------------------
export async function handleGetSubmission(
  repo: SubmissionRepository,
  relationshipResolver: RelationshipResolver,
  actor: AuthenticatedActor,
  submissionId: string,
) {
  const submission = await repo.getSubmissionById(submissionId);
  if (!submission) return errorResponse(404, 'NOT_FOUND', 'Submission not found.');

  const rel = await relationshipResolver.resolve(actor, submissionId);
  try {
    assertCanView(actor, submission, rel);
  } catch (err) {
    const known = handleKnownError(err);
    if (known) return known;
    throw err;
  }

  if (submission.status !== 'COMPLETED' && submission.status !== 'JUDGE_ERROR') {
    return { status: 200, body: toSubmissionStatusDTO(submission) };
  }

  const [files, officialResult] = await Promise.all([repo.getSubmissionFiles(submissionId), repo.getOfficialEvaluationResult(submissionId)]);
  return { status: 200, body: toSubmissionDetailDTO(submission, files, officialResult, []) };
}

// ---------------------------------------------------------------------------
// GET /attempts/:attemptId/submissions  (history)
// ---------------------------------------------------------------------------
export async function handleGetSubmissionHistory(repo: SubmissionRepository, actor: AuthenticatedActor, attemptId: string) {
  const attempt = await repo.getAttemptById(attemptId);
  if (!attempt) return errorResponse(404, 'NOT_FOUND', 'Attempt not found.');
  if (attempt.userId !== actor.userId && actor.role !== 'instructor' && actor.role !== 'admin') {
    return errorResponse(403, 'FORBIDDEN', 'You are not authorized to view this history.');
  }

  const submissions = await repo.listSubmissionsForAttempt(attemptId);
  const rows = await Promise.all(
    submissions.map(async (s) => toSubmissionHistoryRowDTO(s, s.currentEvaluationResultId ? await repo.getOfficialEvaluationResult(s.id) : null)),
  );
  return { status: 200, body: rows };
}

// ---------------------------------------------------------------------------
// POST /submissions/:id/cancel
// ---------------------------------------------------------------------------
const CANCELLABLE_STATUSES = ['QUEUED', 'COMPILING', 'RUNNING', 'EVALUATING'] as const;

export async function handleCancelSubmission(repo: SubmissionRepository, actor: AuthenticatedActor, submissionId: string) {
  const submission = await repo.getSubmissionById(submissionId);
  if (!submission) return errorResponse(404, 'NOT_FOUND', 'Submission not found.');
  if (submission.userId !== actor.userId) return errorResponse(403, 'FORBIDDEN', 'You may only cancel your own submissions.');

  try {
    const updated = await repo.transitionSubmissionStatus(submissionId, [...CANCELLABLE_STATUSES], 'CANCELLED', 'student-requested');
    return { status: 200, body: toSubmissionStatusDTO(updated) };
  } catch (err) {
    const known = handleKnownError(err);
    if (known) return known;
    return errorResponse(409, 'CANNOT_CANCEL', 'This submission can no longer be cancelled.');
  }
}

// ---------------------------------------------------------------------------
// POST /submissions/:id/reevaluate
// ---------------------------------------------------------------------------
export async function handleReevaluateSubmission(repo: SubmissionRepository, actor: AuthenticatedActor, submissionId: string, reason: string) {
  if (!canInitiateReevaluation(actor)) {
    return errorResponse(403, 'FORBIDDEN', 'You are not authorized to request a re-evaluation.');
  }
  if (!reason || reason.trim().length < 5) {
    return errorResponse(400, 'REASON_REQUIRED', 'A re-evaluation requires a reason of at least 5 characters, for the audit trail.');
  }

  try {
    const job = await repo.initiateReevaluation({ submissionId, actorId: actor.userId, actorRole: actor.role, reason });
    return { status: 202, body: { evaluationJobId: job.id, status: job.status } };
  } catch (err) {
    const known = handleKnownError(err);
    if (known) return known;
    return errorResponse(503, 'REEVALUATION_UNAVAILABLE', 'Could not start re-evaluation right now. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// GET /submissions/:id/admin-debug  (admin / problem_author only)
// ---------------------------------------------------------------------------
export async function handleGetAdminDebug(repo: SubmissionRepository, actor: AuthenticatedActor, submissionId: string, relationshipResolver: RelationshipResolver) {
  const submission = await repo.getSubmissionById(submissionId);
  if (!submission) return errorResponse(404, 'NOT_FOUND', 'Submission not found.');

  const rel = await relationshipResolver.resolve(actor, submissionId);
  if (!canViewAdminDebugInfo(actor, rel)) {
    return errorResponse(403, 'FORBIDDEN', 'Admin-level submission diagnostics are restricted to admins and problem authors.');
  }

  const auditEvents = await repo.listAuditEventsForSubmission(submissionId);
  return { status: 200, body: toAdminDebugDTO(null, auditEvents) }; // job internals require a repo method beyond this interface slice — see ENGINEERING_REPORT.md
}

void randomUUID; // available for handlers needing their own correlation id beyond what submitCode already generates

/**
 * INTEGRATION NOTE for wiring these into a real HTTP layer (Next.js API routes are
 * assumed likely given the Supabase-centric stack — adjust for Express if not):
 *
 *   export async function POST(req: NextRequest) {
 *     const actor = await resolveActorFromSession(req); // your existing auth
 *     const result = await handleCreateSubmission(deps, {
 *       actor, ipAddress: req.headers.get('x-forwarded-for') ?? 'unknown', body: await req.json(),
 *     });
 *     return NextResponse.json(result.body, { status: result.status });
 *   }
 *
 * `deps` (repo, versionResolver, assessmentPolicyResolver, languageCatalog, limits,
 * now, rateLimiters) is constructed once at startup from real implementations and
 * passed to every handler — see src/worker/worker.ts's main() for the analogous
 * pattern on the worker side.
 */
