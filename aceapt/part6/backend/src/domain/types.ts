/**
 * ACEAPT Feature 6 - Domain Types
 * ---------------------------------------------------------------------------
 * Single source of truth for the shapes and enums used across the assessment
 * engine. Nothing in here talks to a database or HTTP - it's pure domain
 * modeling, per section 49/50 of the spec (conceptual data model + modules).
 */

// ============================================================================
// ENUMS
// ============================================================================

export type AssessmentType =
  | 'DIAGNOSTIC_ASSESSMENT'
  | 'PROGRESS_ASSESSMENT'
  | 'MASTERY_ASSESSMENT'
  | 'MIXED_APTITUDE_ASSESSMENT'
  | 'TIMED_ASSESSMENT'
  | 'FULL_MOCK_ASSESSMENT'
  | 'READINESS_ASSESSMENT'
  | 'FINAL_READINESS_CHECK';

export type AssessmentStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'ABANDONED';

export type Difficulty = 'EASY' | 'MEDIUM' | 'MEDIUM_PLUS' | 'HARD';

export type Domain = 'QUANTITATIVE' | 'LOGICAL' | 'VERBAL';

export type Topic =
  | 'ARITHMETIC'
  | 'ALGEBRA'
  | 'DATA_INTERPRETATION'
  | 'ANALYTICAL_REASONING'
  | 'PATTERNS_SERIES'
  | 'GRAMMAR'
  | 'READING_COMPREHENSION';

export type ExposureStatus =
  | 'SEEN'
  | 'ATTEMPTED'
  | 'CORRECT'
  | 'INCORRECT'
  | 'SKIPPED'
  | 'REVISITED'
  | 'MASTERED'
  | 'RECENTLY_EXPOSED'
  | 'REPEATEDLY_FAILED'
  | 'REPEATEDLY_SUCCESSFUL';

export type ErrorType =
  | 'CONCEPT_GAP'
  | 'PROCEDURAL_ERROR'
  | 'CALCULATION_ERROR'
  | 'LOGICAL_ERROR'
  | 'MISREAD'
  | 'CARELESS_ERROR'
  | 'TIME_PRESSURE'
  | 'GUESS'
  | 'PARTIAL_UNDERSTANDING'
  | 'UNKNOWN';

export type QuestionHealth =
  | 'HEALTHY'
  | 'REVIEW_REQUIRED'
  | 'AMBIGUOUS'
  | 'LOW_VALUE'
  | 'TOO_EASY'
  | 'TOO_HARD'
  | 'ANSWER_ISSUE'
  | 'EXPLANATION_ISSUE'
  | 'RETIRED';

export type ReadinessState =
  | 'NOT_READY'
  | 'FOUNDATION'
  | 'DEVELOPING'
  | 'APPROACHING_READY'
  | 'READY'
  | 'HIGHLY_READY';

export type ReadinessConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type ReadinessDimension =
  | 'ACCURACY'
  | 'SPEED'
  | 'CONSISTENCY'
  | 'TIME_MANAGEMENT'
  | 'CONCEPT_STABILITY'
  | 'DIFFICULTY_STABILITY'
  | 'EXAM_PRESSURE_PERFORMANCE'
  | 'QUESTION_SELECTION'
  | 'STRATEGY_EFFECTIVENESS';

export type NavigationEventType =
  | 'VIEW'
  | 'ANSWER'
  | 'ANSWER_CHANGE'
  | 'SKIP'
  | 'LEAVE'
  | 'RETURN'
  | 'CLEAR';

// ============================================================================
// QUESTIONS
// ============================================================================

export interface QuestionOption {
  id: string; // 'A' | 'B' | 'C' | 'D' etc.
  text: string;
}

/** Full question record, including the answer key. NEVER sent to the client as-is. */
export interface Question {
  id: string;
  domain: Domain;
  topic: Topic;
  skill: string; // fine-grained skill tag, e.g. "percentages", "time-speed-distance"
  difficulty: Difficulty;
  prompt: string;
  context?: string; // shared passage/table text (used by RC + DI question groups)
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
  expectedTimeSeconds: number;
  health: QuestionHealth;
  tags: string[];
  createdAt: string;
}

/** What the client is allowed to see while an assessment is in progress. */
export interface QuestionForClient {
  id: string;
  position: number;
  prompt: string;
  context?: string;
  options: QuestionOption[];
  expectedTimeSeconds: number;
  // Deliberately NO domain/topic/skill/difficulty/correctOptionId/explanation -
  // section 10: topic labels stay hidden during realistic simulation.
}

// ============================================================================
// BLUEPRINT
// ============================================================================

export interface TopicWeight {
  topic: Topic;
  domain: Domain;
  weightPct: number; // percentage of the assessment's questions from this topic
}

export interface DifficultyDistribution {
  EASY: number;
  MEDIUM: number;
  MEDIUM_PLUS: number;
  HARD: number;
}

export interface AssessmentBlueprint {
  id: string;
  type: AssessmentType;
  label: string;
  purpose: string;
  questionCount: number;
  durationSeconds: number;
  topicWeights: TopicWeight[];
  difficultyDistribution: DifficultyDistribution; // must sum to 1.0
  sections?: { name: string; domains: Domain[] }[];
  scoringRule: 'EQUAL_WEIGHT' | 'DIFFICULTY_WEIGHTED';
  focusTopics?: Topic[]; // used by MASTERY_ASSESSMENT / PROGRESS_ASSESSMENT
  minPriorAssessmentsRequired?: number; // e.g. FINAL_READINESS_CHECK needs evidence first
}

// ============================================================================
// ASSESSMENT / SESSION
// ============================================================================

export interface Assessment {
  id: string;
  studentId: string;
  type: AssessmentType;
  blueprintId: string;
  status: AssessmentStatus;
  questionIds: string[]; // ordered
  durationSeconds: number;
  startedAt: string | null;
  endsAt: string | null; // server-computed: startedAt + durationSeconds
  submittedAt: string | null;
  currentQuestionId: string | null;
  formLabel: string; // 'FORM_A' etc, for future equivalent-forms support
  createdAt: string;
}

export interface NavigationEvent {
  type: NavigationEventType;
  at: string; // ISO timestamp, server-generated
  value?: string; // e.g. selected option id
}

export interface AttemptRecord {
  assessmentId: string;
  questionId: string;
  firstViewedAt: string | null;
  firstAnsweredAt: string | null;
  firstAnswer: string | null;
  finalAnswer: string | null;
  answerChangeCount: number;
  correct: boolean | null; // null until scored at submit time
  timeSpentMs: number; // accumulated server-measured viewing time
  skipped: boolean;
  revisited: boolean;
  visitCount: number;
  navigationLog: NavigationEvent[];
}

// ============================================================================
// EXPOSURE TRACKING (section 12)
// ============================================================================

export interface QuestionExposure {
  studentId: string;
  questionId: string;
  statuses: ExposureStatus[];
  timesSeen: number;
  timesCorrect: number;
  timesIncorrect: number;
  lastSeenAt: string;
}

// ============================================================================
// ANALYSIS OUTPUTS
// ============================================================================

export interface SkillPerformance {
  domain: Domain;
  topic: Topic;
  skill: string;
  attempted: number;
  correct: number;
  accuracyPct: number;
  avgTimeSpentSeconds: number;
  label: 'STRONG' | 'STABLE' | 'RISK' | 'CRITICAL' | 'INSUFFICIENT_DATA';
}

export interface DifficultyPerformancePoint {
  difficulty: Difficulty;
  attempted: number;
  correct: number;
  accuracyPct: number | null; // null if attempted === 0
}

export interface TimeInvestmentFlag {
  questionId: string;
  position: number;
  kind: 'OVER_INVESTMENT' | 'UNDER_INVESTMENT';
  timeSpentSeconds: number;
  expectedTimeSeconds: number;
  correct: boolean | null;
  note: string;
}

export interface SectionTimeUsage {
  domain: Domain;
  allocatedShareSeconds: number; // proportional share of total time based on question share
  actualTimeSeconds: number;
  questionsCount: number;
}

export interface TimeAnalysis {
  totalTimeSeconds: number;
  timeUsedSeconds: number;
  timeRemainingSeconds: number;
  avgTimePerQuestionSeconds: number;
  unansweredCount: number;
  unansweredDueToTime: number;
  overInvestmentFlags: TimeInvestmentFlag[];
  underInvestmentFlags: TimeInvestmentFlag[];
  sectionTimeUsage: SectionTimeUsage[];
}

export interface ErrorClassification {
  questionId: string;
  errorType: ErrorType;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string;
}

export interface AnswerChangeInsight {
  totalChanges: number;
  correctToWrong: number;
  wrongToCorrect: number;
  correctToCorrect: number;
  netEffect: number; // wrongToCorrect - correctToWrong
  hasSufficientEvidence: boolean; // section 23: only report conclusions with enough evidence
  insightText: string | null;
}

export interface SkipStrategyInsight {
  totalSkips: number;
  effectiveSkips: number; // skipped, then later answered correctly with reasonable time
  trappedCount: number; // over-invested AND wrong AND never skipped
  neverSkipsDespiteStruggle: boolean;
  overAggressiveSkipping: boolean;
  insightText: string;
}

export interface ReadinessDimensionScore {
  dimension: ReadinessDimension;
  score: number; // 0-100
  scored: boolean; // false if insufficient evidence to compute meaningfully
  explanation: string;
}

export interface Readiness {
  modelVersion: string;
  overallScore: number; // 0-100
  state: ReadinessState;
  confidence: ReadinessConfidence;
  confidenceReason: string;
  dimensions: ReadinessDimensionScore[];
  sectionReadiness: { domain: Domain; score: number }[];
  computedAt: string;
}

export interface RiskArea {
  domain: Domain;
  topic: Topic;
  skill?: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  dominantErrorType?: ErrorType;
  timeRelated: boolean;
}

export interface PracticeRecommendation {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  domain: Domain;
  topic: Topic;
  skill?: string;
  targetDifficulty: Difficulty;
  errorPattern?: ErrorType;
  timeIssue: boolean;
  objective: string;
  suggestedQuestionCount: number;
}

export interface Diagnosis {
  whatWentWell: string[];
  whatWentWrong: string[];
  why: string[];
  biggestRisk: string;
  whatToFixFirst: string;
  whatToPracticeNext: string;
  whenToReassess: string;
}

export interface AssessmentResult {
  assessmentId: string;
  studentId: string;
  scoredAt: string;
  rawScore: number;
  maxScore: number;
  accuracyPct: number;
  attemptedCount: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  skillPerformance: SkillPerformance[];
  difficultyCurve: DifficultyPerformancePoint[];
  timeAnalysis: TimeAnalysis;
  errorClassifications: ErrorClassification[];
  answerChangeInsight: AnswerChangeInsight;
  skipStrategyInsight: SkipStrategyInsight;
  practiceVsAssessmentGap: {
    available: boolean;
    practiceAccuracyPct: number | null;
    assessmentAccuracyPct: number;
    gapPct: number | null;
    note: string;
  };
  readiness: Readiness;
  riskAreas: RiskArea[];
  recommendations: PracticeRecommendation[];
  diagnosis: Diagnosis;
}

// ============================================================================
// ADAPTERS (Feature 3 / 4 / 5 integration boundary - see adapters/*.ts)
// ============================================================================

export interface SkillStateSnapshot {
  studentId: string;
  skill: string;
  topic: Topic;
  masteryLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  masteryScore: number; // 0-100, from Feature 3
}

export interface PracticeHistorySample {
  studentId: string;
  topic: Topic;
  skill?: string;
  accuracyPct: number;
  sampledFrom: 'FEATURE_5_PRACTICE';
  sampleSize: number;
}

export interface PracticeSessionRequest {
  studentId: string;
  recommendation: PracticeRecommendation;
  sourceAssessmentId: string;
}

export interface PracticeSessionHandle {
  practiceSessionId: string;
  status: 'CREATED';
  createdAt: string;
}
