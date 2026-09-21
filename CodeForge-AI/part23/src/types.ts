// ============================================================================
// CodeForge AI — Debugging Coach — Core Types
// ============================================================================
// Shared vocabulary between the deterministic coaching engine, the AI
// orchestration layer, the API handlers, and the persistence layer.
//
// IMPORTANT: fields marked "from Feature N" describe data this module expects
// to receive from an existing CodeForge system (execution engine, complexity
// analysis, etc). Their exact shape here is a best-guess reconstruction from
// the product spec, NOT something read from real code (none was available).
// Before wiring this in, align these interfaces with your actual Feature
// 16-22 output types — do not assume they match byte-for-byte.
// ============================================================================

export type ISODateString = string;
export type UUID = string;

// ---------------------------------------------------------------------------
// Phases (Section 4)
// ---------------------------------------------------------------------------

export enum DebuggingPhase {
  OBSERVE = "OBSERVE",
  REPRODUCE = "REPRODUCE",
  LOCALIZE = "LOCALIZE",
  HYPOTHESIZE = "HYPOTHESIZE",
  INVESTIGATE = "INVESTIGATE",
  EXPERIMENT = "EXPERIMENT",
  ROOT_CAUSE = "ROOT_CAUSE",
  FIX = "FIX",
  VERIFY = "VERIFY",
  RESOLVED = "RESOLVED",
}

export const PHASE_ORDER: DebuggingPhase[] = [
  DebuggingPhase.OBSERVE,
  DebuggingPhase.REPRODUCE,
  DebuggingPhase.LOCALIZE,
  DebuggingPhase.HYPOTHESIZE,
  DebuggingPhase.INVESTIGATE,
  DebuggingPhase.EXPERIMENT,
  DebuggingPhase.ROOT_CAUSE,
  DebuggingPhase.FIX,
  DebuggingPhase.VERIFY,
  DebuggingPhase.RESOLVED,
];

// ---------------------------------------------------------------------------
// Action taxonomy (Section 7) — controlled vocabulary. The AI is never
// allowed to invent an action outside this set (Section 40).
// ---------------------------------------------------------------------------

export enum DebuggingActionType {
  REPRODUCE_FAILURE = "REPRODUCE_FAILURE",
  COMPARE_EXPECTED_ACTUAL = "COMPARE_EXPECTED_ACTUAL",
  INSPECT_OUTPUT = "INSPECT_OUTPUT",
  INSPECT_VARIABLE = "INSPECT_VARIABLE",
  INSPECT_TRACE = "INSPECT_TRACE",
  CHECK_SOURCE_LOCATION = "CHECK_SOURCE_LOCATION",
  CREATE_HYPOTHESIS = "CREATE_HYPOTHESIS",
  REFINE_HYPOTHESIS = "REFINE_HYPOTHESIS",
  TEST_HYPOTHESIS = "TEST_HYPOTHESIS",
  RUN_TARGETED_CASE = "RUN_TARGETED_CASE",
  COMPARE_STATES = "COMPARE_STATES",
  CHECK_INVARIANT = "CHECK_INVARIANT",
  ISOLATE_FUNCTION = "ISOLATE_FUNCTION",
  CHECK_CALL_CHAIN = "CHECK_CALL_CHAIN",
  CHECK_EDGE_CASE = "CHECK_EDGE_CASE",
  CHECK_COMPLEXITY = "CHECK_COMPLEXITY",
  APPLY_FIX = "APPLY_FIX",
  RUN_REGRESSION = "RUN_REGRESSION",
  REFLECT_ON_ROOT_CAUSE = "REFLECT_ON_ROOT_CAUSE",
}

export const ALL_ACTION_TYPES: DebuggingActionType[] = Object.values(DebuggingActionType);

// ---------------------------------------------------------------------------
// Hypothesis lifecycle (Section 12)
// ---------------------------------------------------------------------------

export enum HypothesisStatus {
  PROPOSED = "PROPOSED",
  TESTING = "TESTING",
  SUPPORTED = "SUPPORTED",
  REJECTED = "REJECTED",
  INCONCLUSIVE = "INCONCLUSIVE",
  ABANDONED = "ABANDONED",
}

// ---------------------------------------------------------------------------
// Coaching modes / levels (Sections 34-35)
// ---------------------------------------------------------------------------

export enum CoachingMode {
  GUIDED = "GUIDED",
  SOCRATIC = "SOCRATIC",
  MINIMAL = "MINIMAL",
  LEARNING = "LEARNING",
  INTERVIEW = "INTERVIEW",
}

export enum CoachingLevel {
  OBSERVATION = "OBSERVATION",
  QUESTION = "QUESTION",
  DIRECTION = "DIRECTION",
  TARGETED_HINT = "TARGETED_HINT",
  SPECIFIC_GUIDANCE = "SPECIFIC_GUIDANCE",
  ROOT_CAUSE_EXPLANATION = "ROOT_CAUSE_EXPLANATION",
  SOLUTION_EXPLANATION = "SOLUTION_EXPLANATION",
}

export const COACHING_LEVEL_ORDER: CoachingLevel[] = [
  CoachingLevel.OBSERVATION,
  CoachingLevel.QUESTION,
  CoachingLevel.DIRECTION,
  CoachingLevel.TARGETED_HINT,
  CoachingLevel.SPECIFIC_GUIDANCE,
  CoachingLevel.ROOT_CAUSE_EXPLANATION,
  CoachingLevel.SOLUTION_EXPLANATION,
];

/**
 * Server-authoritative ceiling per mode (Section 34: "The frontend must not
 * be able to switch an assessment/interview into unrestricted coaching.").
 * Enforced in domain/coaching-progression.ts, never trusted from the client.
 */
export const COACHING_LEVEL_CEILING: Record<CoachingMode, CoachingLevel> = {
  [CoachingMode.INTERVIEW]: CoachingLevel.DIRECTION,
  [CoachingMode.MINIMAL]: CoachingLevel.TARGETED_HINT,
  [CoachingMode.SOCRATIC]: CoachingLevel.SPECIFIC_GUIDANCE,
  [CoachingMode.GUIDED]: CoachingLevel.ROOT_CAUSE_EXPLANATION,
  [CoachingMode.LEARNING]: CoachingLevel.SOLUTION_EXPLANATION,
};

export enum StudentSkillLevel {
  BEGINNER = "BEGINNER",
  INTERMEDIATE = "INTERMEDIATE",
  ADVANCED = "ADVANCED",
}

export enum InformationGain {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export const INFORMATION_GAIN_WEIGHT: Record<InformationGain, number> = {
  [InformationGain.LOW]: 0.25,
  [InformationGain.MEDIUM]: 0.6,
  [InformationGain.HIGH]: 1.0,
};

export enum ConfidenceLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

// ---------------------------------------------------------------------------
// Evidence — consumed from Features 16-22 (Section 6, 53). Never fabricated:
// absent fields must stay `undefined`, never guessed or defaulted to a
// plausible-looking value.
// ---------------------------------------------------------------------------

export interface FailureEvidence {
  failureType?: "WRONG_ANSWER" | "RUNTIME_ERROR" | "TIMEOUT" | "MEMORY_LIMIT" | "COMPILE_ERROR" | string;
  failingInput?: string;
  expectedOutput?: string;
  actualOutput?: string;
  errorMessage?: string;
  stackTrace?: string;
  runtimeMs?: number;
  memoryKb?: number;
  sourceLocation?: { file?: string; line?: number; symbol?: string };
  failingTestIds?: string[];
  regression?: { previouslyPassingTestIds: string[]; nowFailingTestIds: string[] };
}

export interface TraceEvent {
  step: number;
  location?: string;
  variables: Record<string, unknown>;
}

/** From Feature 17 — Complexity Analysis */
export interface ComplexityEvidence {
  timeComplexity?: string; // e.g. "O(n^2)"
  spaceComplexity?: string;
  constraintN?: number;
  timedOut?: boolean;
}

/** From Feature 18 — Code Quality Analysis */
export interface QualityEvidence {
  duplicationDetected?: boolean;
  duplicationLocations?: string[];
}

/** From Features 20/21 — Code-Reasoning Consistency / Understanding Check */
export interface UnderstandingEvidence {
  variableUnderstanding?: Record<string, "weak" | "partial" | "strong">;
}

export interface DebuggingEvidenceBundle {
  failure?: FailureEvidence;
  trace?: TraceEvent[];
  complexity?: ComplexityEvidence;
  quality?: QualityEvidence;
  understanding?: UnderstandingEvidence;
  capturedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Hypotheses (Sections 10-14)
// ---------------------------------------------------------------------------

export interface HypothesisQualityScore {
  specificity: number; // 0-1
  testability: number; // 0-1
  evidenceConnection: number; // 0-1
  falsifiability: number; // 0-1
  overall: number; // 0-1 weighted combination
}

export interface Hypothesis {
  id: UUID;
  statement: string;
  status: HypothesisStatus;
  quality?: HypothesisQualityScore;
  /** Variables/locations whose inspection would distinguish this hypothesis from competitors. */
  distinguishingTargets?: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
  resolvedAt?: ISODateString;
  resolutionEvidence?: string;
}

export interface Experiment {
  id: UUID;
  hypothesisId: UUID;
  expectedObservation: string;
  action: DebuggingActionType;
  target?: string;
  actualObservation?: string;
  interpretation?: string;
  createdAt: ISODateString;
  completedAt?: ISODateString;
}

// ---------------------------------------------------------------------------
// Student action log (Section 17 trial-and-error detection, Section 32 signals)
// ---------------------------------------------------------------------------

export type StudentActionType =
  | "EDIT_CODE"
  | "RUN_CODE"
  | "CREATE_HYPOTHESIS"
  | "UPDATE_HYPOTHESIS"
  | "REQUEST_GUIDANCE"
  | "RESPOND_TO_COACH"
  | "REQUEST_HINT_ESCALATION"
  | "APPLY_FIX"
  | "RUN_REGRESSION"
  | "DECLARE_RESOLVED";

export interface StudentActionEvent {
  id: UUID;
  type: StudentActionType;
  payload?: Record<string, unknown>;
  at: ISODateString;
}

// ---------------------------------------------------------------------------
// Next-best-action (Sections 7-9, 39-40)
// ---------------------------------------------------------------------------

export interface RankedAction {
  action: DebuggingActionType;
  target?: string;
  score: number; // 0-1
  informationGain: InformationGain;
  reason: string;
}

export interface NextBestAction {
  phase: DebuggingPhase;
  recommendedAction: DebuggingActionType;
  target?: string;
  reason: string;
  evidenceRefs: string[];
  expectedInformationGain: InformationGain;
  coachingLevel: CoachingLevel;
  question: string;
  confidence: ConfidenceLevel;
  aiGenerated: boolean;
  /** Full ranked candidate list, kept for observability / debugging the coach itself. */
  candidates: RankedAction[];
}

// ---------------------------------------------------------------------------
// Student skill adaptation (Section 33)
// ---------------------------------------------------------------------------

export interface StudentSkillState {
  level: StudentSkillLevel;
  priorSessionsCompleted: number;
  avgHypothesisQuality?: number;
  avgDebuggingEfficiency?: number;
}

// ---------------------------------------------------------------------------
// Coach state (Section 5)
// ---------------------------------------------------------------------------

export interface DebuggingCoachState {
  id: UUID;
  /** FK into Feature 22's debugging session. Never owned/created by this module. */
  debuggingSessionId: UUID;
  userId: UUID;
  currentPhase: DebuggingPhase;
  coachingMode: CoachingMode;
  coachingLevel: CoachingLevel;
  /** Consecutive coaching turns at the current level without measurable progress. */
  stuckSignalCount: number;
  reproductionStatus: "NOT_ATTEMPTED" | "FAILED" | "REPRODUCED";
  hypotheses: Hypothesis[];
  experiments: Experiment[];
  evidence: DebuggingEvidenceBundle;
  knownRootCause?: string;
  fixState: { proposed?: string; appliedAt?: ISODateString; alignsWithRootCause?: boolean };
  regressionState: { lastRunAt?: ISODateString; passed?: boolean; newlyFailingTestIds?: string[] };
  studentSkill: StudentSkillState;
  actionLog: StudentActionEvent[];
  recommendationHistory: NextBestAction[];
  version: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Skill signals (Section 32) — output only, consumed by a future Skill
// Signal Engine. This module does not implement that engine.
// ---------------------------------------------------------------------------

export interface DebuggingSkillSignals {
  hypothesisQuality: number;
  evidenceUsage: number;
  problemLocalization: number;
  experimentQuality: number;
  rootCauseReasoning: number;
  fixReasoning: number;
  regressionAwareness: number;
  debuggingEfficiency: number;
}

// ---------------------------------------------------------------------------
// Postmortem (Section 31)
// ---------------------------------------------------------------------------

export interface DebuggingPostmortem {
  failureSummary: string;
  rootCause: string;
  evidence: string[];
  studentHypotheses: { statement: string; status: HypothesisStatus }[];
  successfulExperiment?: string;
  rejectedHypotheses: string[];
  fix: string;
  regressionResult: string;
  keyLearning: string;
  recommendedPractice: string;
  skillSignals: DebuggingSkillSignals;
  generatedAt: ISODateString;
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function newId(): UUID {
  // crypto.randomUUID is available in Node 18+ and all modern browsers.
  return crypto.randomUUID();
}

export function nowIso(): ISODateString {
  return new Date().toISOString();
}
