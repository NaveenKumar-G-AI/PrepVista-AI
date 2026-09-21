import type {
  CompilationStatus,
  EvaluationLifecycleState,
  ExecutionStatus,
  FailureOrigin,
  RuntimeFailureCategory,
  TestStatus,
  Verdict,
} from "./enums.js";

/** Version/environment binding — makes every result reproducible and auditable. */
export interface EvidenceVersionBinding {
  problemId: string;
  problemVersion: string;
  testSuiteVersion: string;
  checkerVersion: string;
  compilerVersion: string | null;
  runtimeVersion: string | null;
  executionEnvironmentId: string;
}

export interface NormalizedTestOutcome {
  testId: string;
  visibility: "PUBLIC" | "HIDDEN";
  order: number;
  status: TestStatus;
  durationMs: number | null;
  memoryKb: number | null;
  terminationReason: string | null;
  failureCategory:
    | "WRONG_OUTPUT"
    | "TIME_LIMIT"
    | "MEMORY_LIMIT"
    | "OUTPUT_LIMIT"
    | "RUNTIME_ERROR"
    | "EMPTY_OUTPUT"
    | "MALFORMED_OUTPUT"
    | null;
}

export interface TestAggregate {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
  notExecuted: number;
  completed: number; // passed + failed + errored (i.e. actually ran to a result)
}

export interface ScoringResult {
  strategy: "PASS_COUNT" | "WEIGHTED_GROUPS" | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passedGroups: string[] | null;
  failedGroups: string[] | null;
}

export interface ResourceEvidence {
  timeLimitMs: number | null;
  observedWallTimeMs: number | null;
  observedCpuTimeMs: number | null;
  memoryLimitKb: number | null;
  observedPeakMemoryKb: number | null;
  outputLimitBytes: number | null;
  observedOutputBytes: number | null;
  violations: { time: boolean; memory: boolean; output: boolean; process: boolean };
}

export interface CompilationEvidence {
  status: CompilationStatus;
  durationMs: number | null;
  error: {
    compiler: string | null;
    line: number | null;
    column: number | null;
    message: string | null;
    category: string | null;
  } | null;
}

export interface RuntimeEvidence {
  status: ExecutionStatus;
  exitCode: number | null;
  signal: string | null;
  terminationReason: string | null;
  failureCategory: RuntimeFailureCategory | null;
  failureMessage: string | null;
}

export interface EvaluationCompleteness {
  required: number;
  completed: number;
  isComplete: boolean;
}

export interface InfrastructureEvidence {
  hadFailure: boolean;
  origin: FailureOrigin | null;
  reasons: string[]; // internal-only reason codes, never shown to students verbatim
}

/**
 * The single normalized representation the rest of CodeForge should consume.
 * Bound immutably to the exact submission/evaluation/version combination
 * that produced it (see EvidenceVersionBinding).
 */
export interface NormalizedExecutionResult {
  submissionId: string;
  evaluationId: string;
  language: string;
  versionBinding: EvidenceVersionBinding;

  compilation: CompilationEvidence;
  runtime: RuntimeEvidence;
  resources: ResourceEvidence;
  tests: NormalizedTestOutcome[];
  testAggregate: TestAggregate;
  scoring: ScoringResult;
  completeness: EvaluationCompleteness;
  infrastructure: InfrastructureEvidence;

  evaluatedAtIso: string;
  normalizedAtIso: string;
}

/**
 * The authoritative, finalized result. Only produced by
 * `finalizeResult()` once completeness + internal consistency are proven.
 * Immutable once created — corrections must go through re-evaluation.
 */
export interface FinalizedExecutionResult {
  kind: "FINALIZED";
  submissionId: string;
  evaluationId: string;
  verdict: Verdict;
  origin: FailureOrigin;
  result: NormalizedExecutionResult;
  finalizedAtIso: string;
  /** Deterministic content hash over the version binding + verdict + score, for audit/replay checks. */
  resultHash: string;
}

/** Returned instead of a FinalizedExecutionResult when finalization is refused. */
export interface UnfinalizedResult {
  kind: "NOT_FINALIZED";
  submissionId: string;
  evaluationId: string;
  reason:
    | "EVALUATION_INCOMPLETE"
    | "INTERNAL_INCONSISTENCY"
    | "STALE_EVENT"
    | "ALREADY_FINALIZED_IMMUTABLE";
  detail: string;
}

export type FinalizationOutcome = FinalizedExecutionResult | UnfinalizedResult;

export interface LifecycleEvent {
  submissionId: string;
  evaluationId: string;
  state: EvaluationLifecycleState;
  emittedAtIso: string;
  /** Monotonic sequence from the source system, when available — used for out-of-order detection. */
  sequence: number | null;
}
