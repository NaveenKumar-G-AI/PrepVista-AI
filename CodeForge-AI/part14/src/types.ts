// Core domain types for the AI Code Coach engine.
// These describe the *sanitized, structured* shape of everything the coach
// is allowed to reason about — never a raw database record. See
// context/contextBuilder.ts for the boundary that constructs this safely.

export type CoachingMode =
  | "GUIDE"
  | "EXPLAIN"
  | "HINT"
  | "ASK_QUESTION"
  | "SHOW_RELEVANT_CODE"
  | "EXPLAIN_ERROR"
  | "DEEP_EXPLANATION"
  | "SOLUTION_ASSISTANCE";

/** Practice = full progressive guidance. Assessment/interview restrict how far coaching can go. */
export type CoachingPolicyMode = "practice" | "assessment" | "interview";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type Verdict =
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "COMPILE_ERROR"
  | "RUNTIME_ERROR"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "NO_EXECUTION";

export interface ProblemContext {
  problemId: string;
  title: string;
  statement: string;
  constraints: string[];
  examples: { input: string; output: string }[];
  languageRestrictions?: string[];
  evaluationRules?: string;
  // Deliberately no hiddenTests / referenceSolution fields here — see
  // context/contextBuilder.ts, which never reads them into this shape.
}

export interface CodeLocation {
  file?: string;
  line?: number;
  endLine?: number;
  function?: string;
}

export interface CodeContext {
  language: string;
  source: string;
  relevantLocations?: CodeLocation[];
}

export interface ExecutionEvidence {
  hasExecuted: boolean;
  verdict: Verdict;
  testsPassed?: number;
  testsTotal?: number;
  /** Only indices the platform's own visibility rules already allow surfacing. */
  visibleFailedTestIndices?: number[];
  /** Generic signal only ("some hidden cases failed") — never counts, never details. */
  hiddenEvaluationFailed?: boolean;
  compilerError?: string;
  runtimeError?: string;
  timeMs?: number;
  memoryKb?: number;
  timedOut?: boolean;
  memoryExceeded?: boolean;
  /** Pointer back to the authoritative execution record. Never fabricated. */
  executionRecordId?: string;
  raw: unknown;
}

export interface SubmissionHistoryEntry {
  submissionId: string;
  submittedAt: string;
  verdict: Verdict;
  testsPassed?: number;
  testsTotal?: number;
  codeSnapshotRef?: string;
}

export interface CoachingStateSnapshot {
  sessionId: string;
  coachingDepth: number; // 1..5
  previousHints: string[];
  previousObservations: string[];
  identifiedConcept?: string;
  unresolvedIssues: string[];
  resolvedIssues: string[];
  lastHintHash?: string;
}

export interface CoachingRequest {
  requestedMode: CoachingMode;
  studentQuestion?: string;
}

export interface AssembledCoachingContext {
  problem: ProblemContext;
  code: CodeContext;
  evidence: ExecutionEvidence;
  history: SubmissionHistoryEntry[];
  state: CoachingStateSnapshot;
  request: CoachingRequest;
  policyMode: CoachingPolicyMode;
}
