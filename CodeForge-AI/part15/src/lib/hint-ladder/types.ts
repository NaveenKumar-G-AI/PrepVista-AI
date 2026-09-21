/**
 * Hint Ladder — core domain types.
 *
 * These types are the vocabulary the rest of the system (policy engine,
 * prompt builder, output guard, persistence, API, UI) is built on. Keeping
 * them centralized is what lets the policy engine, the anti-repetition
 * tracker, and the persistence layer all agree on the same shapes without
 * duplicating logic.
 */

// ---------------------------------------------------------------------------
// Assistance ladder (the "depth" axis — how much is revealed)
// ---------------------------------------------------------------------------

export const ASSISTANCE_LEVELS = [
  "INDEPENDENT",
  "DIRECTION",
  "CONCEPT",
  "TARGETED",
  "SPECIFIC",
  "DETAILED",
  "SOLUTION_ASSISTANCE",
] as const;

export type AssistanceLevel = (typeof ASSISTANCE_LEVELS)[number];

export function levelIndex(level: AssistanceLevel): number {
  return ASSISTANCE_LEVELS.indexOf(level);
}

export function levelAfter(level: AssistanceLevel): AssistanceLevel {
  const idx = levelIndex(level);
  return ASSISTANCE_LEVELS[Math.min(idx + 1, ASSISTANCE_LEVELS.length - 1)] as AssistanceLevel;
}

// ---------------------------------------------------------------------------
// Hint type (the "strategy" axis — how the guidance is delivered)
// ---------------------------------------------------------------------------

export const HINT_TYPES = [
  "DIRECTION",
  "CONCEPT",
  "QUESTION",
  "EXAMPLE",
  "TARGETED",
  "CODE_LOCATION",
  "SPECIFIC",
  "EXPLANATION",
  "SOLUTION_ASSISTANCE",
] as const;

export type HintType = (typeof HINT_TYPES)[number];

/**
 * When a hint fails to help, this is the order strategies are tried in
 * before the ladder is allowed to advance a full assistance level. This is
 * what keeps escalation from feeling mechanical — a failed CONCEPT-level
 * hint becomes a QUESTION, not "CONCEPT hint, try again."
 */
export const FAILED_HINT_STRATEGY_CHAIN: HintType[] = [
  "CONCEPT",
  "QUESTION",
  "EXAMPLE",
  "CODE_LOCATION",
  "EXPLANATION",
];

export const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const PRODUCT_MODES = ["PRACTICE", "ASSESSMENT", "INTERVIEW"] as const;
export type ProductMode = (typeof PRODUCT_MODES)[number];

export const HINT_EVENT_TYPES = [
  "HINT_REQUESTED",
  "HINT_GENERATED",
  "HINT_DELIVERED",
  "HINT_ACKNOWLEDGED",
  "HINT_ESCALATED",
  "HINT_ATTEMPTED",
  "HINT_EFFECTIVE",
  "HINT_INEFFECTIVE",
  "ISSUE_RESOLVED",
  "SOLUTION_ASSISTANCE_USED",
] as const;
export type HintEventType = (typeof HINT_EVENT_TYPES)[number];

/**
 * Coarse teaching-concept taxonomy used ONLY for anti-repetition grouping
 * and analytics rollups. The actual hint text is always dynamically
 * generated free text (`conceptDetail`) — this enum never gates content,
 * it just lets two hints be compared for "is this the same underlying
 * lesson" without doing an LLM call (cost control).
 */
export const TEACHING_CONCEPTS = [
  "BOUNDARY_CONDITION",
  "OFF_BY_ONE",
  "LOOP_LOGIC",
  "RECURSION_BASE_CASE",
  "DATA_STRUCTURE_MISUSE",
  "TYPE_MISMATCH",
  "NULL_UNDEFINED_HANDLING",
  "ALGORITHM_CHOICE",
  "STATE_MUTATION",
  "INPUT_PARSING",
  "OUTPUT_FORMAT",
  "PERFORMANCE_COMPLEXITY",
  "SYNTAX_ERROR",
  "OTHER",
] as const;
export type TeachingConcept = (typeof TEACHING_CONCEPTS)[number];

export type StudentResponseSignal =
  | "UNDERSTOOD"
  | "STILL_STUCK"
  | "ASKED_FOR_MORE"
  | "ASKED_QUESTION"
  | "REQUESTED_SOLUTION"
  | "NONE";

// ---------------------------------------------------------------------------
// Code location — never fabricated. `sourceOfTruth` records HOW we know
// this location, so downstream code/UI can refuse to render a "jump to
// line" affordance for anything that isn't STACK_TRACE-grade evidence.
// ---------------------------------------------------------------------------

export interface CodeLocation {
  file: string | null;
  functionName: string | null;
  startLine: number | null;
  endLine: number | null;
  snippet: string | null;
  sourceOfTruth: "STACK_TRACE" | "STATIC_HEURISTIC" | "NONE";
}

export const UNKNOWN_LOCATION: CodeLocation = {
  file: null,
  functionName: null,
  startLine: null,
  endLine: null,
  snippet: null,
  sourceOfTruth: "NONE",
};

// ---------------------------------------------------------------------------
// Execution evidence — owned by the (existing) execution system. The Hint
// Ladder only ever reads this; it never computes verdicts itself.
// ---------------------------------------------------------------------------

export type Verdict =
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "RUNTIME_ERROR"
  | "COMPILE_ERROR"
  | "TIMEOUT"
  | "MEMORY_LIMIT_EXCEEDED"
  | "PENDING"
  | "UNKNOWN";

export interface PublicFailingCase {
  input: string;
  expected: string;
  actual: string;
}

export interface ExecutionEvidence {
  submissionId: string;
  verdict: Verdict;
  testsPassed: number | null;
  testsTotal: number | null;
  compilerError: string | null;
  runtimeError: string | null;
  stackTrace: string | null;
  /** Only ever PUBLIC cases. Hidden case data must never reach this object. */
  failingPublicCases: PublicFailingCase[] | null;
  createdAt: string;
}

export interface SubmissionSnapshot {
  submissionId: string;
  code: string;
  language: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Root issue hypothesis — the internal model connecting an observed
// failure to a teaching plan. Built deterministically + heuristically;
// the LLM refines the phrasing but the confidence tier is computed by us.
// ---------------------------------------------------------------------------

export interface RootIssueHypothesis {
  observedFailure: string;
  concept: TeachingConcept;
  conceptDetail: string;
  relevantArea: CodeLocation | null;
  teachingObjective: string;
  confidence: Confidence;
}

export type HintEffectiveness = "PENDING" | "STRONG" | "MEDIUM" | "WEAK" | "NEGATIVE" | "INCONCLUSIVE";

export interface DeliveredHintRecord {
  eventId: string;
  level: AssistanceLevel;
  hintType: HintType;
  concept: TeachingConcept;
  targetSignature: string;
  text: string;
  observation: string;
  confidence: Confidence;
  codeLocation: CodeLocation | null;
  createdAt: string;
  executionSnapshotAtDelivery: Pick<ExecutionEvidence, "verdict" | "testsPassed" | "testsTotal"> | null;
  studentResponse: StudentResponseSignal | null;
  effectiveness: HintEffectiveness;
  source: "AI_GENERATED" | "DETERMINISTIC_FALLBACK" | "TEMPLATED_RESOLUTION";
}

export interface HintLadderState {
  sessionId: string;
  studentId: string;
  problemId: string;
  mode: ProductMode;
  status: "ACTIVE" | "RESOLVED" | "ABANDONED";
  currentLevel: AssistanceLevel;
  consecutiveIneffectiveCount: number;
  lastKnownExecution: ExecutionEvidence | null;
  executionAtLastHint: ExecutionEvidence | null;
  codeAtLastHint: string | null;
  rootIssue: RootIssueHypothesis | null;
  history: DeliveredHintRecord[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function freshLadderState(params: {
  sessionId: string;
  studentId: string;
  problemId: string;
  mode: ProductMode;
  now: string;
}): HintLadderState {
  return {
    sessionId: params.sessionId,
    studentId: params.studentId,
    problemId: params.problemId,
    mode: params.mode,
    status: "ACTIVE",
    currentLevel: "INDEPENDENT",
    consecutiveIneffectiveCount: 0,
    lastKnownExecution: null,
    executionAtLastHint: null,
    codeAtLastHint: null,
    rootIssue: null,
    history: [],
    version: 0,
    createdAt: params.now,
    updatedAt: params.now,
  };
}

// ---------------------------------------------------------------------------
// Problem context (read-only view of the existing problem model)
// ---------------------------------------------------------------------------

export interface ProblemContext {
  problemId: string;
  title: string;
  statement: string;
  constraints: string[];
  examples: Array<{ input: string; output: string; explanation?: string }>;
  entryPointHints: string[]; // e.g. expected function names per language, if known
  language: string;
}

// ---------------------------------------------------------------------------
// Request/response shapes used across policy engine, service, and API
// ---------------------------------------------------------------------------

export type HintRequestAction = "REQUEST_HELP" | "REQUEST_DEEPER" | "REQUEST_SOLUTION";

export interface StudentResponseInput {
  type: "QUICK_ACTION" | "FREE_TEXT";
  value: string;
}

export interface HintRequestInput {
  requestId: string;
  problemId: string;
  action: HintRequestAction;
  studentResponse?: StudentResponseInput;
}
