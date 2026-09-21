/**
 * Framework-agnostic example of how interviewSessionService composes into
 * HTTP handlers. Adapt the request/response shapes to whatever you're
 * actually running (Next.js route handlers, Express, Fastify, Supabase Edge
 * Functions). Auth extraction is illustrative — wire deps.auth to your real
 * AuthContextProvider. errorToHttpStatus maps every InterviewError code
 * onto PHASE 46's error list.
 */

import {
  createInterview, startInterview, submitCode,
  InterviewError, InterviewRepository, SubmissionRepository,
} from '../services/interviewSessionService';
import { CodeExecutionAdapter, EventLoggerAdapter, AuthContextProvider } from '../integration/adapters';

export interface HandlerDeps {
  repo: InterviewRepository;
  submissions: SubmissionRepository;
  execution: CodeExecutionAdapter;
  events: EventLoggerAdapter;
  auth: AuthContextProvider;
}

export function errorToHttpStatus(code: string): number {
  switch (code) {
    case 'INTERVIEW_NOT_FOUND': return 404;
    case 'UNAUTHORIZED_INTERVIEW': return 403;
    case 'INTERVIEW_ALREADY_COMPLETED':
    case 'INTERVIEW_EXPIRED':
    case 'INVALID_STATE':
    case 'SUBMISSION_NOT_ALLOWED': return 409;
    default: return 500;
  }
}

async function requireStudentId(deps: HandlerDeps): Promise<string> {
  const studentId = await deps.auth.getCurrentStudentId();
  if (!studentId) throw new InterviewError('UNAUTHORIZED_INTERVIEW', 'No authenticated student.');
  return studentId;
}

export async function handleCreateInterview(deps: HandlerDeps, body: {
  blueprintId: string; blueprintVersionId: string; targetRole: string; idempotencyKey: string; batchId?: string;
}) {
  const studentId = await requireStudentId(deps);
  return createInterview({ studentId, ...body }, deps.repo);
}

export async function handleStartInterview(deps: HandlerDeps, interviewId: string, durationMinutes: number) {
  const studentId = await requireStudentId(deps);
  return startInterview(interviewId, studentId, durationMinutes, deps.repo);
}

export async function handleSubmitCode(deps: HandlerDeps, body: {
  interviewId: string; problemId: string; challengeId: string; code: string;
  language: string; submissionType: 'RUN' | 'SUBMIT'; idempotencyKey: string;
}) {
  const studentId = await requireStudentId(deps);
  const interview = await deps.repo.findById(body.interviewId);
  if (!interview) throw new InterviewError('INTERVIEW_NOT_FOUND', body.interviewId);
  return submitCode({ ...body, requestingStudentId: studentId }, interview, deps.execution, deps.events, deps.submissions);
}

// advanceState-backed routes (CLARIFICATION -> APPROACH_DISCUSSION -> ... ->
// COMPLETED) follow the identical requireStudentId + repo.findById +
// service-call pattern shown above — omitted here since it would just
// repeat this same shape once per target state.
