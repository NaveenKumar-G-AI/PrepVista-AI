// ============================================================
// ACEAPT OS — FEATURE 21: DIAGNOSIS + NEXT-BEST-ACTION ENGINE
// Core domain types
//
// This file defines the shared vocabulary for the whole engine.
// Nothing in here talks to a database or an API — it's pure data
// modelling so every other module can be written against a fixed
// contract.
// ============================================================

export type SkillId = string;
export type StudentId = string;

// ------------------------------------------------------------
// Skill graph (prerequisite structure used by the root-cause engine)
// ------------------------------------------------------------

export interface Skill {
  id: SkillId;
  name: string;
  topic: string;
  /** Skills that must be solid before this one can be reliably solid. */
  prerequisiteIds: SkillId[];
}

// ------------------------------------------------------------
// Student
// ------------------------------------------------------------

export type StudentGoal =
  | 'APTITUDE_MASTERY'
  | 'PLACEMENT_READINESS'
  | 'SPECIFIC_ASSESSMENT'
  | 'SPEED_IMPROVEMENT'
  | 'ACCURACY_IMPROVEMENT'
  | 'CONCEPT_FOUNDATION'
  | 'MAINTAIN_MASTERY';

export interface Student {
  id: StudentId;
  name: string;
  goal: StudentGoal;
  /** ISO date string, or null if there is no fixed deadline. */
  targetAssessmentDate: string | null;
  dailyTimeBudgetMinutes: number;
}

// ------------------------------------------------------------
// Evidence — the raw material every diagnosis is built from.
// Each evidence item is tagged with the upstream feature that
// produced it, so the diagnosis engine can reason about evidence
// *diversity*, not just evidence *quantity*.
// ------------------------------------------------------------

export type EvidenceSourceFeature =
  | 'F13_READINESS'
  | 'F14_MASTERY_TRANSFER'
  | 'F15_LEARNING_JOURNEY'
  | 'F16_INTERVENTION_RECOVERY'
  | 'F17_QUESTION_INTELLIGENCE'
  | 'F18_REASONING_INTELLIGENCE'
  | 'F19_RETENTION'
  | 'F20_SIMULATION_PRESSURE';

interface EvidenceBase {
  skillId: SkillId;
  /** ISO date string. */
  timestamp: string;
  sourceFeature: EvidenceSourceFeature;
}

/** A single answered question. The bulk of raw evidence is this shape. */
export interface AttemptEvidence extends EvidenceBase {
  type: 'ATTEMPT';
  isCorrect: boolean;
  timed: boolean;
  responseTimeSeconds: number;
  benchmarkTimeSeconds: number;
  hintsUsed: number;
  difficulty: 'easy' | 'medium' | 'hard';
  /**
   * A tag Question Intelligence (Feature 17) assigns to the wrong-answer
   * pattern, e.g. 'denominator-selection-error', 'arithmetic-slip',
   * 'procedure-order-error', 'misread-condition'. Undefined when correct
   * or when no pattern was detected.
   */
  errorPatternTag?: string;
  /** Other skills entangled in this question, for concept-interference detection. */
  mixedConceptSkillIds?: SkillId[];
  /** 0–1 self-reported confidence captured at answer time, if collected. */
  studentStatedConfidence?: number;
  questionContextFamiliarity: 'familiar' | 'novel' | 'mixed';
}

/** Step-level reasoning trace, independent of whether the final answer was right. */
export interface ReasoningTraceEvidence extends EvidenceBase {
  type: 'REASONING_TRACE';
  stepsCorrect: boolean;
  finalAnswerCorrect: boolean;
  brokeDownAtStep?: string;
}

export interface RetentionEvidence extends EvidenceBase {
  type: 'RETENTION';
  daysSinceLastMastery: number;
  /** 0–1, what the decay model expected recall strength to be. */
  predictedRetentionStrength: number;
  /** 0–1, what was actually observed. */
  observedRecallStrength: number;
}

export interface TransferEvidence extends EvidenceBase {
  type: 'TRANSFER';
  familiarContextAccuracy: number;
  novelContextAccuracy: number;
}

export interface SimulationEvidence extends EvidenceBase {
  type: 'SIMULATION';
  timedAccuracy: number;
  untimedAccuracy: number;
  /** 0–1, low = spends time on the wrong questions first. */
  questionOrderEfficiencyScore: number;
  sessionAbandonmentRate: number;
  rapidGuessRate: number;
}

export interface MasteryEvidence extends EvidenceBase {
  type: 'MASTERY';
  masteryLevel: number;
  masteredOn?: string;
  neverLearned: boolean;
}

export type EvidenceItem =
  | AttemptEvidence
  | ReasoningTraceEvidence
  | RetentionEvidence
  | TransferEvidence
  | SimulationEvidence
  | MasteryEvidence;

// ------------------------------------------------------------
// Diagnosis taxonomy (spec section 3)
// ------------------------------------------------------------

export type DiagnosisCategory =
  | 'CONCEPT_GAP'
  | 'CONCEPT_MISUNDERSTANDING'
  | 'RETRIEVAL_WEAKNESS'
  | 'RETENTION_DECAY'
  | 'PREREQUISITE_GAP'
  | 'TRANSFER_FAILURE'
  | 'REASONING_FAILURE'
  | 'QUESTION_INTERPRETATION_FAILURE'
  | 'PROCEDURAL_ERROR'
  | 'CALCULATION_ERROR'
  | 'CARELESS_ERROR'
  | 'TIME_EFFICIENCY_ISSUE'
  | 'QUESTION_SELECTION_ISSUE'
  | 'PRESSURE_PERFORMANCE_DEGRADATION'
  | 'CONFIDENCE_CALIBRATION_ISSUE'
  | 'CONCEPT_INTERFERENCE'
  | 'INCONSISTENT_PERFORMANCE'
  | 'INSUFFICIENT_EVIDENCE';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface DiagnosisHypothesis {
  category: DiagnosisCategory;
  skillId: SkillId;
  confidence: ConfidenceLevel;
  /** Internal 0–1 score used for ranking. Never shown to the student directly. */
  confidenceScore: number;
  /** Short, evidence-grounded bullet points — never an unqualified claim. */
  evidenceSummary: string[];
  affectedSkillIds: SkillId[];
  recommendedActionTypes: ActionType[];
  verificationMethod: string;
}

export interface ErrorCluster {
  patternTag: string;
  count: number;
  exampleSkillIds: SkillId[];
}

export interface SkillDiagnosisReport {
  skillId: SkillId;
  /** Ranked hypotheses, highest confidence first. hypotheses[0] is primary. */
  hypotheses: DiagnosisHypothesis[];
  errorClusters: ErrorCluster[];
  evidenceCount: number;
}

// ------------------------------------------------------------
// Root-cause graph
// ------------------------------------------------------------

export interface BottleneckCandidate {
  skillId: SkillId;
  /** How many currently-weak skills sit downstream of this one. */
  downstreamWeakCount: number;
  downstreamWeakSkillIds: SkillId[];
  /** This skill's own weakness severity, 0–1 (1 = never learned). */
  ownSeverity: number;
  /** downstreamWeakCount × ownSeverity, normalized. Higher = fix this first. */
  bottleneckScore: number;
}

// ------------------------------------------------------------
// Actions
// ------------------------------------------------------------

export type ActionType =
  | 'LEARN'
  | 'RELEARN'
  | 'RECALL'
  | 'REACTIVATE'
  | 'PRACTICE'
  | 'TRANSFER'
  | 'REASONING_DRILL'
  | 'MICRO_QUIZ'
  | 'CONTRASTIVE_PRACTICE'
  | 'TIMED_PRACTICE'
  | 'QUESTION_SELECTION_TRAINING'
  | 'MOCK_TEST'
  | 'RECOVERY_SESSION'
  | 'REVIEW'
  | 'WAIT'
  | 'VERIFY'
  | 'RESTORE_PREREQUISITE';

export interface ActionDefinition {
  type: ActionType;
  label: string;
  baseDurationMinutes: number;
  /** Position in the escalation ladder for remediation-style actions (spec §22). Lower = tried first. */
  escalationLevel: number;
  description: string;
}

export interface ScoredAction {
  action: ActionDefinition;
  /** The skill whose diagnosis produced this action — always look up the SkillDiagnosisReport by this, not targetSkillId. */
  originSkillId: SkillId;
  targetSkillId: SkillId;
  /** True when this action targets an upstream prerequisite rather than the originally weak skill. */
  isPrerequisiteRepair: boolean;
  score: number;
  scoreBreakdown: {
    expectedBenefit: number;
    diagnosticConfidence: number;
    goalRelevance: number;
    readinessImpact: number;
    timeCostMinutes: number;
  };
  reason: string;
  diagnosisCategory: DiagnosisCategory;
}

// ------------------------------------------------------------
// Intervention memory / verification (spec §20, §21, §22, §43, §44)
// ------------------------------------------------------------

export type InterventionOutcome = 'IMPROVED' | 'NO_CHANGE' | 'WORSENED' | 'PENDING';

export interface InterventionRecord {
  id: string;
  studentId: StudentId;
  skillId: SkillId;
  diagnosisCategory: DiagnosisCategory;
  actionType: ActionType;
  startedAt: string;
  beforeMetric?: number;
  afterMetric?: number;
  verifiedAt?: string;
  outcome: InterventionOutcome;
}

// ------------------------------------------------------------
// Student state (spec §17)
// ------------------------------------------------------------

export type StudentState =
  | 'LEARNING'
  | 'PRACTICING'
  | 'MASTERING'
  | 'RETAINING'
  | 'WEAKENING'
  | 'RECOVERING'
  | 'READY'
  | 'AT_RISK';

export interface FatigueSignal {
  isFatigued: boolean;
  reasons: string[];
  suggestedSessionCapMinutes: number | null;
}

// ------------------------------------------------------------
// Top-level orchestrator output
// ------------------------------------------------------------

export interface NextBestActionResult {
  student: Student;
  generatedAt: string;
  studentState: StudentState;
  fatigue: FatigueSignal;
  diagnosisReports: SkillDiagnosisReport[];
  bottlenecks: BottleneckCandidate[];
  rankedActions: ScoredAction[];
  /** The single action the home screen should show ("today's best action"). */
  primaryAction: ScoredAction | null;
  primaryExplanation: string;
  /** Multi-step plan when one action isn't enough (spec §19). */
  recoveryPath: ScoredAction[] | null;
  timelineEntry: {
    date: string;
    summary: string;
  };
}
