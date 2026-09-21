import type {
  CorrectnessStatus,
  ConfidenceLevel,
  TestOutcome,
  ErrorCategory,
  MismatchType,
  RequirementCoverageStatus,
  SupportedLanguage,
  AIDegradationReason,
} from "./enums.js";

/**
 * Identity of the exact submission version an assessment refers to.
 * Every assessment MUST be pinned to this triple so that concurrent
 * submissions, re-runs, and idempotent re-analysis can never mix evidence
 * between versions (see CONCURRENCY / IDEMPOTENCY requirements).
 */
export interface SubmissionRef {
  submissionId: string;
  /** Monotonic version/attempt number OR immutable execution result id — the stable identity for idempotency. */
  submissionVersion: string;
  problemId: string;
  userId: string;
  language: SupportedLanguage;
}

/** A single test outcome. `tags` are metadata classifications ONLY — never raw hidden input/output values. */
export interface TestResult {
  id: string;
  outcome: TestOutcome;
  /** Non-identifying classification tags, e.g. "boundary", "duplicate-values", "negative-values", "large-n". */
  tags: string[];
  mismatchType?: MismatchType;
  timeMs?: number;
  memoryKb?: number;
  /** True if this test's inputs/outputs are protected (hidden). Gates what may ever be surfaced verbatim. */
  hidden: boolean;
}

export interface CompilationEvidence {
  attempted: boolean;
  success: boolean;
  /** Raw compiler/linker diagnostics — deterministic, not AI-generated. */
  diagnostics: string[];
}

/**
 * All deterministic, execution-derived evidence for one submission version.
 * This is the ONLY input the deterministic classifier is allowed to use.
 */
export interface ExecutionEvidence {
  ref: SubmissionRef;
  compilation: CompilationEvidence | null;
  tests: {
    totalAvailable: number;
    results: TestResult[];
    /**
     * True only when this evidence set is the FULL authoritative judgment
     * (including hidden tests) used to decide ACCEPTED — not just a public
     * subset. Prevents the engine from over-claiming ACCEPTED on partial
     * evidence.
     */
    gradingComplete: boolean;
  } | null;
  executedAt: string; // ISO 8601
}

export interface SourceRange {
  file?: string;
  startLine: number;
  endLine: number;
  startCol?: number;
  endCol?: number;
  /** The exact source snippet this range points to, extracted from real source — never fabricated. */
  snippet?: string;
}

/** A single deterministic static-analysis finding (never AI-generated). */
export interface StaticFinding {
  ruleId: string;
  language: SupportedLanguage;
  message: string;
  severity: "info" | "warning" | "error";
  range?: SourceRange;
  /** Which analyzer produced this: real compiler, real AST walk, or a documented heuristic. */
  source: "compiler-diagnostic" | "ast-analysis" | "heuristic";
}

/** A structured requirement extracted from the problem specification. */
export interface Requirement {
  id: string;
  description: string;
  category:
    | "input"
    | "output"
    | "constraint"
    | "edge-case"
    | "ordering"
    | "numeric"
    | "behavior";
  /** Tags this requirement should be checked against, matched to TestResult.tags where possible. */
  relatedTags: string[];
}

export interface RequirementCoverage {
  requirement: Requirement;
  status: RequirementCoverageStatus;
  /** IDs of TestResult / StaticFinding entries that support this status. Never free text alone. */
  supportingEvidenceIds: string[];
  rationale: string;
}

/** One failure cluster produced by the pattern-matching / clustering engine. */
export interface FailureCluster {
  id: string;
  /** Test ids in this cluster (not raw inputs). */
  testIds: string[];
  sharedTags: string[];
  /** A clearly-labeled HYPOTHESIS, never presented as fact. */
  hypothesis: string;
  observedFact: string;
}

/** Deterministic confidence breakdown — this is NOT the AI's self-reported confidence. */
export interface EvidenceConfidence {
  level: ConfidenceLevel;
  reasons: string[];
}

/** The deterministic verdict — computed with ZERO AI involvement. */
export interface DeterministicVerdict {
  status: CorrectnessStatus;
  errorCategory: ErrorCategory;
  confidence: EvidenceConfidence;
  passRateAvailable: number | null; // passed / totalAvailable, or null if not applicable
  totalAvailable: number;
  passed: number;
  failed: number;
  skipped: number;
  clusters: FailureCluster[];
  summary: string;
}

/** A single AI-produced finding, always evidence-linked. */
export interface AIFinding {
  claim: string;
  /** IDs of evidence items (tests, static findings) this claim cites. Findings with no evidence are dropped. */
  evidenceIds: string[];
  confidence: ConfidenceLevel;
}

export interface RootCause {
  layer: "algorithm" | "implementation" | "specification-misunderstanding" | "unknown";
  description: string;
  affectedRegions: SourceRange[];
}

/**
 * The validated, trusted shape of an AI analysis result AFTER schema
 * validation and evidence-grounding checks. `statusAssessment` is the AI's
 * own opinion — it is recorded for observability/disagreement-tracking but
 * is NEVER used to set the authoritative CorrectnessAssessment.status.
 */
export interface AIAnalysisResult {
  statusAssessment: CorrectnessStatus;
  explanationConfidence: ConfidenceLevel;
  summary: string;
  findings: AIFinding[];
  requirementNotes: Array<{ requirementId: string; note: string; evidenceIds: string[] }>;
  rootCause: RootCause | null;
  recommendedNextAction: string;
}

export interface CorrectnessDelta {
  previousStatus: CorrectnessStatus | null;
  currentStatus: CorrectnessStatus;
  previousPassRate: number | null;
  currentPassRate: number | null;
  improvement: boolean;
  regression: boolean;
  newFailures: string[]; // test ids that now fail but previously passed
  resolvedFailures: string[]; // test ids that now pass but previously failed
}

/** The full, persisted correctness assessment for one submission version. */
export interface CorrectnessAssessment {
  id: string;
  ref: SubmissionRef;
  status: CorrectnessStatus; // == deterministic.status, always
  confidence: ConfidenceLevel; // == deterministic.confidence.level, always
  deterministic: DeterministicVerdict;
  requirementCoverage: RequirementCoverage[];
  staticFindings: StaticFinding[];
  ai: {
    available: boolean;
    degradationReason: AIDegradationReason;
    provider?: string;
    model?: string;
    latencyMs?: number;
    result: AIAnalysisResult | null;
    /** True if the AI's own statusAssessment disagreed with the deterministic status. Product signal, not authoritative. */
    disagreedWithDeterministic: boolean;
  };
  delta: CorrectnessDelta | null;
  createdAt: string;
}
