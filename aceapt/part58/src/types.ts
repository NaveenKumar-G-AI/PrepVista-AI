/**
 * Feature 58 — Guessing Intelligence Engine
 * Core shared types.
 *
 * These mirror the taxonomy in the product spec (§17-20, §53, §103 etc.).
 * Nothing here duplicates the Student/Assessment/Question/Attempt/Confidence
 * models — those are referenced only by opaque UUID string, because they
 * belong to the rest of ACEAPT, not to this module (spec §15/124/186).
 */

export type DecisionContext = 'TRAINING' | 'PRACTICE' | 'MOCK' | 'FORMAL_ASSESSMENT';

export type DecisionAction =
  | 'FULL_SOLVE'
  | 'PARTIAL_SOLVE'
  | 'CONTINUE'
  | 'ELIMINATE'
  | 'ESTIMATE'
  | 'INFORMED_GUESS'
  | 'BLIND_GUESS'
  | 'SKIP'
  | 'RETURN_LATER'
  | 'SWITCH_METHOD'
  | 'KEEP_ANSWER'
  | 'CHANGE_ANSWER';

export type UncertaintyState =
  | 'CERTAIN'
  | 'HIGH_CONFIDENCE'
  | 'PROBABLE'
  | 'UNCERTAIN'
  | 'LOW_CONFIDENCE'
  | 'NO_USEFUL_EVIDENCE';

export type ConfidenceBand = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export const CONFIDENCE_BANDS: ConfidenceBand[] = ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'];

/** How trustworthy a piece of evidence is (§103). Never treat these as equal. */
export type EvidenceLevel = 'OBSERVED' | 'VERIFIED' | 'SELF_REPORTED' | 'INFERRED';

/** Structured evidence signal — never raw chain-of-thought (§101). */
export type EvidenceType =
  | 'OPTION_ELIMINATED_UNIT'
  | 'OPTION_ELIMINATED_MAGNITUDE'
  | 'OPTION_ELIMINATED_SIGN'
  | 'OPTION_ELIMINATED_LOGICAL'
  | 'OPTION_ELIMINATED_FORMULA_CONDITION'
  | 'OPTION_ELIMINATED_CONTRADICTION'
  | 'PARTIAL_CALCULATION'
  | 'FORMULA_INSIGHT'
  | 'MAGNITUDE_ESTIMATE'
  | 'PATTERN_RECOGNITION'
  | 'KNOWN_CONCEPT'
  | 'ANSWER_CHOICE_STRUCTURE'
  | 'NEW_EVIDENCE_FOR_SWITCH';

export interface EvidenceSignal {
  type: EvidenceType;
  level: EvidenceLevel;
  optionId?: string;
  /** Short structured note (e.g. "units don't match"), never free-form reasoning. */
  note?: string;
}

export type InsightConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type Bottleneck =
  | 'TOO_MUCH_TIME'
  | 'TOO_MUCH_GUESSING'
  | 'TOO_MUCH_SKIPPING'
  | 'WEAK_ELIMINATION'
  | 'POOR_CONFIDENCE_CALIBRATION'
  | 'UNSUPPORTED_ANSWER_SWITCHING';

export type TrainingMode =
  | 'DECISION'
  | 'ELIMINATION'
  | 'INFORMED_GUESS'
  | 'ESTIMATION'
  | 'RISK'
  | 'TIME'
  | 'SWITCH'
  | 'CONFIDENCE'
  | 'REVIEW';

/** How much live, in-assessment strategy assistance a specific assessment allows.
 *  Default is NONE. Anything beyond NONE must come from verified assessment config,
 *  never be assumed (§118, §130, §190). */
export type StrategyAssistanceLevel = 'NONE' | 'POST_ONLY' | 'LIVE_LIMITED' | 'FULL';

export type ScoringPolicySource = 'VERIFIED' | 'UNKNOWN';

export interface NavigationRules {
  canSkip: boolean;
  canReturnLater: boolean;
  canChangeAnswer: boolean;
}

export interface DecisionPolicy {
  id: string;
  tenantId: string;
  assessmentVersionId: string;
  correctReward: number;
  /** Non-negative magnitude deducted from score on a wrong attempt. */
  wrongPenalty: number;
  blankValue: number;
  partialValue?: number | null;
  timeLimitSeconds?: number | null;
  navigationRules: NavigationRules;
  strategyAssistance: StrategyAssistanceLevel;
  source: ScoringPolicySource;
  version: number;
  effectiveFrom: string;
}

export type NewDecisionPolicy = Omit<DecisionPolicy, 'id'>;

/** Every field a client can legitimately report about ONE decision, all
 *  available at decision time. Deliberately excludes correctness/outcome —
 *  see DecisionOutcome — so it is structurally impossible to let hindsight
 *  leak into process-quality scoring (§62, §170-171). */
export interface DecisionEventInput {
  tenantId: string;
  studentId: string;
  assessmentId: string;
  assessmentVersionId?: string | null;
  questionVersionId: string;
  attemptId?: string | null;
  context: DecisionContext;
  action: DecisionAction;
  uncertaintyState?: UncertaintyState | null;
  confidenceBand?: ConfidenceBand | null;
  /** Coarse self-reported probability, whole percent. No false precision (§58). */
  confidenceProbability?: number | null;
  evidenceUsed: EvidenceSignal[];
  eliminatedOptionIds: string[];
  totalOptions?: number | null;
  questionExpectedTimeSeconds?: number | null;
  studentExpectedTimeSeconds?: number | null;
  elapsedTimeSeconds: number;
  remainingTestTimeSeconds?: number | null;
  scoringPolicyVersionId?: string | null;
  initialOptionId?: string | null;
  finalOptionId?: string | null;
  answerChanged: boolean;
  idempotencyKey: string;
}

export interface DecisionOutcome {
  /** null until graded / results released. */
  isCorrect: boolean | null;
}

export type QualityRating = 'LOW' | 'MEDIUM' | 'HIGH' | 'NOT_ASSESSABLE';

/** Deliberately NOT a single score (§22, §151) — a profile across dimensions. */
export interface DecisionQualityProfile {
  evidenceUsed: QualityRating;
  optionReduction: QualityRating;
  timeAwareness: QualityRating;
  riskAwareness: QualityRating;
  confidenceCalibration: QualityRating;
  actionAppropriateness: QualityRating;
}

export interface DecisionEvent extends DecisionEventInput {
  id: string;
  isCorrect: boolean | null;
  decisionQuality: DecisionQualityProfile | null;
  createdAt: string;
  decidedAt: string;
}

export interface DecisionInsight {
  id: string;
  tenantId: string;
  studentId: string;
  insightType: Bottleneck | string;
  message: string;
  evidence: Record<string, unknown>;
  confidence: InsightConfidence;
  sampleSize: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
}

export type NewDecisionInsight = Omit<DecisionInsight, 'id' | 'generatedAt'>;

export interface CalibrationSnapshot {
  id: string;
  tenantId: string;
  studentId: string;
  confidenceBand: ConfidenceBand;
  predictedProbability?: number | null;
  observedAccuracy: number;
  sampleSize: number;
  periodStart: string;
  periodEnd: string;
  computedAt: string;
}

export type NewCalibrationSnapshot = Omit<CalibrationSnapshot, 'id' | 'computedAt'>;

export interface TrainingScenario {
  id: string;
  tenantId: string;
  mode: TrainingMode;
  difficultyLevel: number;
  questionVersionId?: string | null;
  policyVersionId?: string | null;
  generatedBy: 'CURATED' | 'AI_GENERATED';
  validationStatus: 'PENDING' | 'VALIDATED' | 'REJECTED';
  payload: Record<string, unknown>;
  createdAt: string;
}

export type NewTrainingScenario = Omit<TrainingScenario, 'id' | 'createdAt'>;

/** Aggregate stats behind bottleneck detection & the personal decision profile.
 *  Rates are 0-1 fractions of the relevant denominator (see domain/bottlenecks.ts
 *  for exactly how each is computed). */
export interface DecisionAggregateStats {
  totalUncertainDecisions: number;
  blindGuessRate: number;
  eliminationRate: number;
  strategicSkipRate: number;
  potentiallyUnnecessarySkipRate: number;
  timeOverrunRate: number;
  unsupportedSwitchRate: number;
  periodStart: string;
  periodEnd: string;
}
