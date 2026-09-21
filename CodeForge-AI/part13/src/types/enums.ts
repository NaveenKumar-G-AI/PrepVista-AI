/**
 * Authoritative verdict enum for CodeForge execution results.
 *
 * This is the ONLY place verdicts are enumerated. If the host application
 * (the real CodeForge repo) already has a verdict type, DELETE this file
 * and re-point `src/types/normalized.ts` at that existing type instead —
 * this module must never introduce a second, conflicting verdict vocabulary.
 */
export const VERDICTS = [
  "ACCEPTED",
  "WRONG_ANSWER",
  "COMPILATION_ERROR",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
  "SYSTEM_ERROR",
  "JUDGE_ERROR",
] as const;

export type Verdict = (typeof VERDICTS)[number];

/** Verdicts that represent a genuine, evidence-backed student failure. */
export const STUDENT_FAILURE_VERDICTS: ReadonlySet<Verdict> = new Set([
  "WRONG_ANSWER",
  "COMPILATION_ERROR",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
]);

/** Verdicts that represent a platform/infrastructure failure, never the student's fault. */
export const PLATFORM_FAILURE_VERDICTS: ReadonlySet<Verdict> = new Set([
  "SYSTEM_ERROR",
  "JUDGE_ERROR",
]);

export const TEST_STATUSES = [
  "PASSED",
  "FAILED",
  "ERROR",
  "SKIPPED",
  "NOT_EXECUTED",
] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

export const COMPILATION_STATUSES = ["NOT_REQUIRED", "SUCCEEDED", "FAILED", "UNKNOWN"] as const;
export type CompilationStatus = (typeof COMPILATION_STATUSES)[number];

export const EXECUTION_STATUSES = [
  "COMPLETED",
  "CRASHED",
  "TIMED_OUT",
  "KILLED_MEMORY",
  "KILLED_OUTPUT",
  "NOT_EXECUTED",
  "UNKNOWN",
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/** Truthful evaluation lifecycle states — no fabricated percentage progress. */
export const EVALUATION_LIFECYCLE_STATES = [
  "SUBMITTED",
  "QUEUED",
  "COMPILING",
  "RUNNING",
  "EVALUATING",
  "FINALIZING",
  "COMPLETED",
] as const;
export type EvaluationLifecycleState = (typeof EVALUATION_LIFECYCLE_STATES)[number];

/** Ordinal rank used to reject stale/out-of-order lifecycle transitions. Higher = later. */
export const LIFECYCLE_RANK: Record<EvaluationLifecycleState, number> = {
  SUBMITTED: 0,
  QUEUED: 1,
  COMPILING: 2,
  RUNNING: 3,
  EVALUATING: 4,
  FINALIZING: 5,
  COMPLETED: 6,
};

export const RUNTIME_FAILURE_CATEGORIES = [
  "UNCAUGHT_EXCEPTION",
  "SEGMENTATION_FAULT",
  "ABORT",
  "STACK_OVERFLOW",
  "SIGNAL_TERMINATION",
  "RUNTIME_LIMIT",
  "UNKNOWN_RUNTIME_FAILURE",
] as const;
export type RuntimeFailureCategory = (typeof RUNTIME_FAILURE_CATEGORIES)[number];

/**
 * Distinguishes WHO owns a failure. This drives the "student failure vs
 * platform failure" rule: infrastructure origins may never be classified
 * as a student-caused verdict.
 */
export type FailureOrigin = "STUDENT_SUBMISSION" | "PLATFORM_INFRASTRUCTURE" | "JUDGE_EVALUATOR";

export type Role = "STUDENT" | "INSTRUCTOR" | "INTERVIEWER" | "ADMINISTRATOR" | "INTERNAL_EVALUATOR";
