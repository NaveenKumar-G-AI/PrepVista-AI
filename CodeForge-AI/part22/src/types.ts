/**
 * Core domain types for CodeForge Debugging Mode.
 *
 * This module is dependency-free by design so it can be shared across the
 * API layer, the repository layer, the sandbox layer, and (via `tsc`
 * project references or a shared package in the real monorepo) the
 * frontend, without pulling in Express/pg/etc.
 */

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export type FailureClass =
  | "RUNTIME_ERROR"
  | "WRONG_ANSWER"
  | "EDGE_CASE_FAILURE"
  | "TIME_LIMIT"
  | "MEMORY_LIMIT"
  | "LOGIC_ERROR"
  | "INTEGRATION_ERROR"
  | "REGRESSION";

export const FAILURE_CLASSES: FailureClass[] = [
  "RUNTIME_ERROR",
  "WRONG_ANSWER",
  "EDGE_CASE_FAILURE",
  "TIME_LIMIT",
  "MEMORY_LIMIT",
  "LOGIC_ERROR",
  "INTEGRATION_ERROR",
  "REGRESSION"
];

export type SessionState =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "ROOT_CAUSE_IDENTIFIED"
  | "FIX_ATTEMPTED"
  | "RESOLVED"
  | "FAILED"
  | "ABANDONED";

export type HypothesisStatus =
  | "PROPOSED"
  | "TESTING"
  | "SUPPORTED"
  | "REJECTED"
  | "INCONCLUSIVE";

export type DebuggingResultStatus =
  | "EXCELLENT_DEBUGGING"
  | "STRONG_DEBUGGING"
  | "DEVELOPING_DEBUGGING"
  | "WEAK_DEBUGGING"
  | "INSUFFICIENT_EVIDENCE";

export type SupportedLanguage = "python" | "javascript";

export type DebugActionType =
  | "RUN"
  | "RUN_FAILING_TEST"
  | "RUN_SELECTED_TEST"
  | "RUN_FULL_SUITE"
  | "INSPECT_OUTPUT"
  | "INSPECT_VARIABLE"
  | "INSPECT_TRACE"
  | "ADD_DIAGNOSTIC"
  | "CREATE_HYPOTHESIS"
  | "REJECT_HYPOTHESIS"
  | "ROOT_CAUSE_IDENTIFIED"
  | "APPLY_CHANGE"
  | "REVERT_CHANGE"
  | "REQUEST_HINT"
  | "SUBMIT_FIX";

export type SkillDimensionName =
  | "FAILURE_RECOGNITION"
  | "REPRODUCTION"
  | "LOCALIZATION"
  | "HYPOTHESIS_FORMATION"
  | "EVIDENCE_GATHERING"
  | "EXPERIMENT_DESIGN"
  | "ROOT_CAUSE_ANALYSIS"
  | "FIX_QUALITY"
  | "REGRESSION_VERIFICATION"
  | "DEBUGGING_EFFICIENCY";

export const SKILL_DIMENSIONS: SkillDimensionName[] = [
  "FAILURE_RECOGNITION",
  "REPRODUCTION",
  "LOCALIZATION",
  "HYPOTHESIS_FORMATION",
  "EVIDENCE_GATHERING",
  "EXPERIMENT_DESIGN",
  "ROOT_CAUSE_ANALYSIS",
  "FIX_QUALITY",
  "REGRESSION_VERIFICATION",
  "DEBUGGING_EFFICIENCY"
];

// ---------------------------------------------------------------------------
// Runtime capability metadata (per spec: "do not pretend every language
// supports identical debugger functionality" -> degrade gracefully)
// ---------------------------------------------------------------------------

export interface RuntimeCapabilities {
  language: SupportedLanguage;
  execution: boolean;
  stackTrace: boolean;
  structuredTrace: boolean;
  breakpoints: boolean;
  variableInspection: boolean;
  resourceMetrics: boolean;
}

export const RUNTIME_CAPABILITIES: Record<SupportedLanguage, RuntimeCapabilities> = {
  python: {
    language: "python",
    execution: true,
    stackTrace: true,
    structuredTrace: true, // via sys.settrace-based tracer, see sandbox/traceCollector
    breakpoints: false, // no interactive stepping in this iteration; see README limitations
    variableInspection: true, // snapshotted at trace events, not live-interactive
    resourceMetrics: true
  },
  javascript: {
    language: "javascript",
    execution: true,
    stackTrace: true,
    structuredTrace: false, // no safe structured tracer implemented yet; falls back to stdout/stderr + stack
    breakpoints: false,
    variableInspection: false,
    resourceMetrics: true
  }
};

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface DebuggingSession {
  id: string;
  userId: string;
  challengeId: string;
  submissionId: string | null;
  language: SupportedLanguage;
  state: SessionState;
  startedAt: string;
  endedAt: string | null;
  currentCode: string;
}

// ---------------------------------------------------------------------------
// Failure fingerprint
// ---------------------------------------------------------------------------

export type ReproductionStatus = "NOT_ATTEMPTED" | "REPRODUCED" | "NOT_REPRODUCIBLE";

export interface SourceLocation {
  file?: string;
  line?: number;
  function?: string;
}

export interface FailureFingerprint {
  id: string;
  sessionId: string;
  failureType: FailureClass;
  input: string | null;
  expectedOutput: string | null;
  actualOutput: string | null;
  errorMessage: string | null;
  stackTrace: string | null;
  sourceLocation: SourceLocation | null;
  runtime: SupportedLanguage;
  executionTimeMs: number | null;
  memoryUsageKB: number | null;
  reproductionStatus: ReproductionStatus;
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// Hypotheses / experiments / actions
// ---------------------------------------------------------------------------

export interface Hypothesis {
  id: string;
  sessionId: string;
  text: string;
  suspectedLocation: string | null;
  suspectedCause: string | null;
  confidence: number; // 0-100, student self-reported
  status: HypothesisStatus;
  createdAt: string;
  updatedAt: string;
}

export type ExperimentConclusion = "SUPPORTED" | "REJECTED" | "INCONCLUSIVE";

export interface Experiment {
  id: string;
  sessionId: string;
  hypothesisId: string;
  action: string;
  expectedResult: string;
  actualResult: string | null;
  conclusion: ExperimentConclusion | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface DebugAction {
  id: string;
  sessionId: string;
  type: DebugActionType;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Root cause / verification
// ---------------------------------------------------------------------------

export type EvidenceRef =
  | { type: "EXECUTION_TRACE"; ref: string }
  | { type: "VARIABLE_STATE"; ref: string }
  | { type: "FAILING_TEST"; ref: string }
  | { type: "CODE_LOCATION"; ref: string }
  | { type: "EXPERIMENT"; ref: string }
  | { type: "BEHAVIOR_COMPARISON"; ref: string };

export interface RootCauseChain {
  symptom: string;
  location: string;
  cause: string;
  rootCause: string;
  fix: string | null;
  supportingEvidence: EvidenceRef[];
}

export interface TestOutcome {
  testId: string;
  visible: boolean;
  passed: boolean;
  input?: string;
  expected?: string;
  actual?: string;
  durationMs?: number;
}

export interface RegressionVerification {
  originalFailureFixed: boolean;
  relatedTestsPassed: boolean;
  hiddenTestsPassed: boolean;
  regressionTestsPassed: boolean;
  resourceTestsPassed: boolean;
  hiddenTestResults: TestOutcome[];
  overallPass: boolean;
}

export interface OverfittingSignal {
  suspected: boolean;
  reasons: string[];
  visiblePassRate: number;
  hiddenPassRate: number;
}

export interface MinimalChangeAnalysis {
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  changedOutsideSuspectedLocation: boolean;
}

// ---------------------------------------------------------------------------
// Skill model / result
// ---------------------------------------------------------------------------

export interface SkillDimensionScore {
  dimension: SkillDimensionName;
  score: number; // 0-100
  confidence: "LOW" | "MEDIUM" | "HIGH";
  evidence: string[];
  status: "INSUFFICIENT_EVIDENCE" | "SCORED";
}

export interface TimelineEvent {
  type: string;
  at: string;
  detail?: string;
}

export interface DebuggingReport {
  failureSummary: string;
  rootCauseSummary: string;
  processSummary: string;
  fixSummary: string;
  verificationSummary: string;
  strengths: string[];
  improvements: string[];
}

export interface DebuggingResult {
  sessionId: string;
  status: DebuggingResultStatus;
  dimensions: SkillDimensionScore[];
  rootCause: RootCauseChain | null;
  regression: RegressionVerification | null;
  overfitting: OverfittingSignal | null;
  report: DebuggingReport;
  timeline: TimelineEvent[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidStateTransitionError extends Error {
  constructor(from: SessionState, event: string) {
    super(`Invalid transition: cannot apply event "${event}" from state "${from}"`);
    this.name = "InvalidStateTransitionError";
  }
}

export class EvidenceRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceRequiredError";
  }
}
