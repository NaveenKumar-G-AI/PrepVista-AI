// ============================================================================
// ACEAPT Feature 12 — Domain Types
// ============================================================================
// Enums are deliberately larger than what this prototype implements (see the
// IMPLEMENTED_* constants below each one) so the taxonomy can grow later
// without a type-level rewrite. Only implemented values have real detector /
// ranking / execution-contract logic behind them — see engine/*.ts.

export type Unavailable = 'unavailable';

// ---------------------------------------------------------------------------
// Intervention taxonomy
// ---------------------------------------------------------------------------

export type InterventionType =
  | 'TARGETED_PRACTICE'
  | 'MICRO_LESSON'
  | 'CONCEPT_RETEACH'
  | 'WORKED_EXAMPLE'
  | 'GUIDED_PRACTICE'
  | 'HINT_SCAFFOLDING'
  | 'DIFFICULTY_REDUCTION'
  | 'DIFFICULTY_INCREASE'
  | 'SPACED_REVIEW'
  | 'ERROR_REMEDIATION'
  | 'TIMED_DRILL'
  | 'UNTIMED_DRILL'
  | 'MICRO_ASSESSMENT'
  | 'FULL_ASSESSMENT'
  | 'SIMULATION'
  | 'RECALL_SESSION'
  | 'MIXED_PRACTICE'
  | 'TOPIC_SWITCH'
  | 'SESSION_SHORTENING'
  | 'SESSION_EXTENSION'
  | 'CHALLENGE_EXPOSURE'
  | 'CONFIDENCE_CALIBRATION'
  | 'EXPLANATION_DEPTH_CHANGE'
  | 'QUESTION_FORMAT_CHANGE'
  | 'REVISION_TRIGGER'
  | 'RECOVERY_SESSION'
  | 'TRANSFER_PRACTICE'
  | 'SPEED_DRILL';

/** Types with real detection + ranking + execution-contract logic in this prototype. */
export const IMPLEMENTED_INTERVENTION_TYPES: InterventionType[] = [
  'TIMED_DRILL',
  'CONCEPT_RETEACH',
  'WORKED_EXAMPLE',
  'GUIDED_PRACTICE',
  'TARGETED_PRACTICE',
  'SPACED_REVIEW',
  'TRANSFER_PRACTICE',
  'MICRO_ASSESSMENT'
];

export type ProblemCategory =
  | 'CONCEPT_GAP'
  | 'CALCULATION_GAP'
  | 'REASONING_GAP'
  | 'INTERPRETATION_GAP'
  | 'TIME_MANAGEMENT_GAP'
  | 'SPEED_GAP'
  | 'RETENTION_GAP'
  | 'TRANSFER_GAP'
  | 'CHALLENGE_EXPOSURE_GAP'
  | 'CONFIDENCE_CALIBRATION_GAP'
  | 'PERSISTENCE_GAP'
  | 'PLAN_REALISM_GAP'
  | 'PRACTICE_DISTRIBUTION_GAP';

/** Categories with real detector functions in this prototype. */
export const IMPLEMENTED_PROBLEM_CATEGORIES: ProblemCategory[] = [
  'CONCEPT_GAP',
  'CALCULATION_GAP',
  'SPEED_GAP',
  'RETENTION_GAP',
  'TRANSFER_GAP'
];

// ---------------------------------------------------------------------------
// Student state (Feature 12's input contract — Section 1 of the spec)
// ---------------------------------------------------------------------------

export type AttemptMode = 'untimed' | 'timed' | 'simulation';

export interface AttemptSummary {
  topic: string;
  skill?: string;
  mode: AttemptMode;
  accuracyPct: number; // 0-100
  questionCount: number;
  attemptedAt: string; // ISO timestamp
  avgTimePerQuestionSec?: number;
  hintsUsed?: number;
  independentCorrectPct?: number; // accuracy on questions solved without hints
}

export interface BehaviorSignal {
  code:
    | 'LOW_CONSISTENCY'
    | 'HIGH_CONSISTENCY'
    | 'PLAN_REALISM_MISMATCH'
    | 'SHORT_SESSION_PREFERENCE'
    | 'LONG_SESSION_TOLERANCE'
    | 'STRONG_PERSISTENCE'
    | 'LOW_PERSISTENCE';
  detail: string;
}

export interface RetentionSignal {
  topic: string;
  daysAfter: number;
  accuracyPct: number;
  measuredAt: string;
}

export interface TransferSignal {
  topic: string;
  familiarAccuracyPct: number;
  novelAccuracyPct: number;
  measuredAt: string;
}

export interface InterventionRecordSummary {
  interventionId: string;
  type: InterventionType;
  topic: string;
  completedAt?: string;
  effectiveness?: EffectivenessLabel;
}

export interface StudentState {
  studentId: string;
  generatedAt: string;
  recentPerformance: AttemptSummary[];
  behaviorProfile: BehaviorSignal[] | Unavailable; // sourced from Feature 11
  persistence: 'low' | 'medium' | 'high' | Unavailable;
  consistency: number | Unavailable; // 0-1
  availableStudyMinutes: number | Unavailable;
  assessmentDeadline: string | Unavailable; // ISO date
  readiness: number | Unavailable; // 0-100, sourced from Feature 10
  interventionHistory: InterventionRecordSummary[];
  retentionSignals: RetentionSignal[] | Unavailable;
  transferSignals: TransferSignal[] | Unavailable;
}

// ---------------------------------------------------------------------------
// Evidence, problems, candidates
// ---------------------------------------------------------------------------

export interface EvidenceItem {
  description: string;
  sampleSize: number;
}

export interface DetectedProblem {
  id: string;
  category: ProblemCategory;
  topic: string;
  skill?: string;
  evidence: EvidenceItem[];
  confidence: number; // 0-1
  reason: string;
  /**
   * The specific "before" measurement that this problem's evidence rests on
   * (e.g. the weak timed/simulation accuracy for a SPEED_GAP). Interventions
   * are measured against THIS number, not a generic topic average, so the
   * before/after comparison stays traceable to the evidence that triggered it.
   */
  baselineAccuracyPct: number;
}

export interface InterventionCandidate {
  type: InterventionType;
  problemId: string;
  rationale: string;
}

export interface ScoredCandidate extends InterventionCandidate {
  score: number;
  scoreBreakdown: {
    problemFit: number;
    studentFit: number;
    contextFit: number;
    historicalResponse: number;
    expectedBenefit: number;
    timeCost: number;
    loadRisk: number;
  };
  flags: ('NON_RESPONSE_RISK' | 'SATURATION_RISK' | 'COLD_START')[];
}

export interface InterventionDecision {
  id: string;
  studentId: string;
  problem: DetectedProblem;
  candidates: ScoredCandidate[];
  selected: ScoredCandidate;
  confidence: number;
  reason: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Execution (Section 7 — execution contracts)
// ---------------------------------------------------------------------------

export type InterventionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';

export interface ExecutionContract {
  type: InterventionType;
  topic: string;
  skill?: string;
  questionCount?: number;
  difficulty?: 'reduced' | 'standard' | 'increased';
  timeLimitSec?: number;
  focusAreas: string[];
  steps?: string[]; // for multi-step paths, e.g. CONCEPT_RETEACH
}

export interface ImmediateResult {
  accuracyPct: number;
  questionsCompleted: number;
  avgTimePerQuestionSec?: number;
  hintsUsed?: number;
  retries?: number;
}

export interface InterventionExecution {
  id: string;
  decisionId: string;
  studentId: string;
  type: InterventionType;
  contract: ExecutionContract;
  status: InterventionStatus;
  startedAt?: string;
  completedAt?: string;
  durationSec?: number;
  result?: ImmediateResult;
}

// ---------------------------------------------------------------------------
// Outcome & effectiveness (Sections 10-13, 50)
// ---------------------------------------------------------------------------

export type EffectivenessLabel =
  | 'SUCCESSFUL'
  | 'PARTIALLY_EFFECTIVE'
  | 'NO_MEASURABLE_CHANGE'
  | 'NEGATIVE_RESPONSE'
  | 'INCONCLUSIVE'
  | 'INSUFFICIENT_DATA';

export interface InterventionOutcome {
  interventionId: string;
  studentId: string;
  beforeAccuracyPct?: number;
  immediateAccuracyPct?: number;
  retentionAccuracyPct?: number;
  retentionMeasuredAt?: string;
  transferFamiliarPct?: number;
  transferNovelPct?: number;
  transferMeasuredAt?: string;
  immediateEffectiveness: EffectivenessLabel;
  retentionEffectiveness?: EffectivenessLabel;
  transferEffectiveness?: EffectivenessLabel;
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// Personal intervention profile (Sections 14, 51)
// ---------------------------------------------------------------------------

export type ResponseLabel = 'HIGH' | 'MEDIUM_HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export interface InterventionProfileEntry {
  type: InterventionType;
  attempts: number;
  successes: number;
  avgImmediateDeltaPct: number | null;
  /** Counted separately from `attempts` — not every attempt gets a retention check. */
  retentionChecks: number;
  avgRetentionDeltaPct: number | null;
  responseLabel: ResponseLabel;
  lastUsedAt?: string;
  nonResponseFlag: boolean;
  saturationFlag: boolean;
}

export interface InterventionProfile {
  studentId: string;
  entries: InterventionProfileEntry[];
  updatedAt: string;
}
