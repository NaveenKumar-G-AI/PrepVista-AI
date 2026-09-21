/**
 * CodeForge AI — Submission System
 * Domain enums. These mirror db/migrations/0001_enums_and_core_tables.sql exactly —
 * if you change one side, change the other. Kept as const arrays (not TS `enum`) so
 * they're usable both as types and as runtime-iterable lists for validation, with zero
 * build step required.
 */

export const SUBMISSION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'VALIDATING',
  'QUEUED',
  'COMPILING',
  'RUNNING',
  'EVALUATING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'JUDGE_ERROR',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const TERMINAL_SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'JUDGE_ERROR',
];

export const SUBMISSION_MODES = ['PRACTICE', 'ASSESSMENT', 'INTERVIEW'] as const;
export type SubmissionMode = (typeof SUBMISSION_MODES)[number];

export const VERDICTS = [
  'ACCEPTED',
  'WRONG_ANSWER',
  'COMPILATION_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'OUTPUT_LIMIT_EXCEEDED',
  'SYSTEM_ERROR',
  'JUDGE_ERROR',
] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Verdicts that reflect the platform's own failure, never the student's. */
export const INFRASTRUCTURE_VERDICTS: readonly Verdict[] = ['SYSTEM_ERROR', 'JUDGE_ERROR'];

export const EVALUATION_JOB_KINDS = ['INITIAL', 'REEVALUATION'] as const;
export type EvaluationJobKind = (typeof EVALUATION_JOB_KINDS)[number];

export const EVALUATION_JOB_STATUSES = ['QUEUED', 'CLAIMED', 'RUNNING', 'DONE', 'FAILED', 'DEAD_LETTER'] as const;
export type EvaluationJobStatus = (typeof EVALUATION_JOB_STATUSES)[number];

export const SUBMISSION_FILE_ROLES = ['MAIN', 'SUPPORTING', 'HEADER', 'CONFIG', 'TEST_HARNESS'] as const;
export type SubmissionFileRole = (typeof SUBMISSION_FILE_ROLES)[number];

export const USER_ROLES = ['student', 'instructor', 'interviewer', 'problem_author', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Real, achievable client-visible states — never fabricated progress percentages. */
export const CLIENT_VISIBLE_STAGES = [
  'Submitted',
  'Queued',
  'Compiling',
  'Running',
  'Evaluating',
  'Finalizing',
  'Result',
] as const;
export type ClientVisibleStage = (typeof CLIENT_VISIBLE_STAGES)[number];
