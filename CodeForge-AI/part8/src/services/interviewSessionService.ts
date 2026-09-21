import { randomUUID } from 'node:crypto';
import { InterviewState, TechnicalInterview } from '../types/domain';
import { canTransition, DEFAULT_TRANSITIONS, TransitionGraph, InvalidTransitionError } from '../state-machine/interviewStateMachine';
import { CodeExecutionAdapter, EventLoggerAdapter, ExecutionResult } from '../integration/adapters';

/** Error codes match PHASE 46's list 1:1 so the HTTP layer can map them directly. */
export class InterviewError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'InterviewError';
  }
}

/** Implement against your real persistence layer (Supabase or otherwise).
 *  This service depends only on this interface for storage. */
export interface InterviewRepository {
  findById(id: string): Promise<TechnicalInterview | null>;
  findByIdempotencyKey(key: string): Promise<TechnicalInterview | null>;
  insert(interview: TechnicalInterview): Promise<TechnicalInterview>;
  updateStatus(
    id: string,
    status: InterviewState,
    extra?: Partial<Pick<TechnicalInterview, 'startedAt' | 'expiresAt' | 'completedAt'>>,
  ): Promise<void>;
}

export interface StoredSubmission {
  id: string;
  interviewId: string;
  problemId: string;
  submissionType: 'RUN' | 'SUBMIT';
  language: string;
  code: string;
  passed: boolean | null;
  executionResult: ExecutionResult;
  idempotencyKey: string;
}

export interface SubmissionRepository {
  findByIdempotencyKey(problemId: string, key: string): Promise<StoredSubmission | null>;
  insert(submission: StoredSubmission): Promise<StoredSubmission>;
}

// ---------------------------------------------------------------------------
// Creation / start — PHASE 5 / PHASE 36 (idempotency)
// ---------------------------------------------------------------------------

export async function createInterview(
  params: {
    studentId: string;
    blueprintId: string;
    blueprintVersionId: string;
    targetRole: string;
    idempotencyKey: string;
    batchId?: string | null;
  },
  repo: InterviewRepository,
): Promise<TechnicalInterview> {
  const existing = await repo.findByIdempotencyKey(params.idempotencyKey);
  if (existing) return existing; // idempotent creation — repeated requests never duplicate a record

  const interview: TechnicalInterview = {
    id: randomUUID(),
    studentId: params.studentId,
    blueprintId: params.blueprintId,
    blueprintVersionId: params.blueprintVersionId,
    batchId: params.batchId ?? null,
    targetRole: params.targetRole,
    status: 'CREATED',
    idempotencyKey: params.idempotencyKey,
    createdAt: new Date().toISOString(),
    startedAt: null,
    expiresAt: null, // set on start, so duration counts from when the student actually begins
    completedAt: null,
  };
  return repo.insert(interview);
}

export async function startInterview(
  interviewId: string,
  requestingStudentId: string,
  durationMinutes: number,
  repo: InterviewRepository,
): Promise<TechnicalInterview> {
  const interview = await requireInterview(interviewId, repo);
  assertOwnership(interview, requestingStudentId);
  assertTransition(interview.status, 'STARTED');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60_000);
  await repo.updateStatus(interviewId, 'STARTED', { startedAt: now.toISOString(), expiresAt: expiresAt.toISOString() });
  return { ...interview, status: 'STARTED', startedAt: now.toISOString(), expiresAt: expiresAt.toISOString() };
}

// ---------------------------------------------------------------------------
// Guards — PHASE 5 / PHASE 35: the browser is never authoritative
// ---------------------------------------------------------------------------

export function assertNotExpired(interview: TechnicalInterview): void {
  if (interview.expiresAt && new Date() > new Date(interview.expiresAt)) {
    throw new InterviewError('INTERVIEW_EXPIRED', 'This interview session has expired.');
  }
}

export function assertOwnership(interview: TechnicalInterview, requestingStudentId: string): void {
  if (interview.studentId !== requestingStudentId) {
    throw new InterviewError('UNAUTHORIZED_INTERVIEW', 'This interview does not belong to the requesting student.');
  }
}

function assertTransition(from: InterviewState, to: InterviewState, graph: TransitionGraph = DEFAULT_TRANSITIONS) {
  if (!canTransition(from, to, graph)) {
    throw new InvalidTransitionError(from, to);
  }
}

async function requireInterview(id: string, repo: InterviewRepository): Promise<TechnicalInterview> {
  const interview = await repo.findById(id);
  if (!interview) throw new InterviewError('INTERVIEW_NOT_FOUND', `No interview with id ${id}`);
  return interview;
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export async function advanceState(
  interviewId: string,
  requestingStudentId: string,
  targetState: InterviewState,
  repo: InterviewRepository,
  graph: TransitionGraph = DEFAULT_TRANSITIONS,
): Promise<TechnicalInterview> {
  const interview = await requireInterview(interviewId, repo);
  assertOwnership(interview, requestingStudentId);
  assertNotExpired(interview);
  assertTransition(interview.status, targetState, graph);

  const extra = targetState === 'COMPLETED' ? { completedAt: new Date().toISOString() } : undefined;
  await repo.updateStatus(interviewId, targetState, extra);
  return { ...interview, status: targetState, ...extra };
}

// ---------------------------------------------------------------------------
// Code submission — PHASE 11 (real execution only) / PHASE 36 (idempotent)
// ---------------------------------------------------------------------------

export async function submitCode(
  params: {
    interviewId: string;
    requestingStudentId: string;
    problemId: string;
    challengeId: string;
    code: string;
    language: string;
    submissionType: 'RUN' | 'SUBMIT';
    idempotencyKey: string;
  },
  interview: TechnicalInterview,
  execution: CodeExecutionAdapter,
  events: EventLoggerAdapter,
  submissions: SubmissionRepository,
): Promise<{ passed: boolean; executionResult: ExecutionResult; deduplicated: boolean }> {
  assertOwnership(interview, params.requestingStudentId);
  assertNotExpired(interview);
  if (!(['CODING', 'TESTING', 'DEBUGGING'] as InterviewState[]).includes(interview.status)) {
    throw new InterviewError('SUBMISSION_NOT_ALLOWED', `Cannot submit code while interview is in ${interview.status}`);
  }

  const existing = await submissions.findByIdempotencyKey(params.problemId, params.idempotencyKey);
  if (existing) {
    return { passed: existing.passed === true, executionResult: existing.executionResult, deduplicated: true };
  }

  // Real execution only — this service has no execution logic of its own (PHASE 11).
  const executionResult = await execution.run({
    code: params.code,
    language: params.language,
    challengeId: params.challengeId,
    hiddenTests: params.submissionType === 'SUBMIT',
  });
  const passed = executionResult.testResults.length > 0 && executionResult.testResults.every(t => t.passed);

  await submissions.insert({
    id: randomUUID(),
    interviewId: params.interviewId,
    problemId: params.problemId,
    submissionType: params.submissionType,
    language: params.language,
    code: params.code,
    passed,
    executionResult,
    idempotencyKey: params.idempotencyKey,
  });

  await events.log(
    params.interviewId,
    executionResult.compiled ? (passed ? 'TEST_PASSED' : 'TEST_FAILED') : 'CODE_RUN',
    { submissionType: params.submissionType, passed, testResults: executionResult.testResults },
    'STUDENT',
  );

  return { passed, executionResult, deduplicated: false };
}
