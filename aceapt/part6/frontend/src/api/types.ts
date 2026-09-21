export type AssessmentType =
  | 'DIAGNOSTIC_ASSESSMENT' | 'PROGRESS_ASSESSMENT' | 'MASTERY_ASSESSMENT' | 'MIXED_APTITUDE_ASSESSMENT'
  | 'TIMED_ASSESSMENT' | 'FULL_MOCK_ASSESSMENT' | 'READINESS_ASSESSMENT' | 'FINAL_READINESS_CHECK';

export type AssessmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED' | 'COMPLETED' | 'ABANDONED';
export type ReadinessState = 'NOT_READY' | 'FOUNDATION' | 'DEVELOPING' | 'APPROACHING_READY' | 'READY' | 'HIGHLY_READY';
export type ReadinessConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReadinessDimension =
  | 'ACCURACY' | 'SPEED' | 'CONSISTENCY' | 'TIME_MANAGEMENT' | 'CONCEPT_STABILITY'
  | 'DIFFICULTY_STABILITY' | 'EXAM_PRESSURE_PERFORMANCE' | 'QUESTION_SELECTION' | 'STRATEGY_EFFECTIVENESS';
export type Domain = 'QUANTITATIVE' | 'LOGICAL' | 'VERBAL';
export type Topic =
  | 'ARITHMETIC' | 'ALGEBRA' | 'DATA_INTERPRETATION'
  | 'ANALYTICAL_REASONING' | 'PATTERNS_SERIES' | 'GRAMMAR' | 'READING_COMPREHENSION';

export interface QuestionOption { id: string; text: string; }
export interface QuestionForClient {
  id: string;
  position: number;
  prompt: string;
  context?: string;
  options: QuestionOption[];
  expectedTimeSeconds: number;
}

export interface AssessmentMeta {
  id: string;
  type: AssessmentType;
  status: AssessmentStatus;
  durationSeconds: number;
  questionCount: number;
  formLabel: string;
  createdAt: string;
  startedAt?: string | null;
}

export interface QuestionOrderEntry { id: string; position: number; answered: boolean; skipped: boolean; }

export interface AssessmentStateResponse {
  assessment: AssessmentMeta;
  remainingSeconds: number;
  progress: { answered: number; skipped: number; total: number };
  currentQuestion: QuestionForClient | null;
  selectedOptionId: string | null;
  questionOrder: QuestionOrderEntry[];
}

export interface ReadinessDimensionScore {
  dimension: ReadinessDimension;
  score: number;
  scored: boolean;
  explanation: string;
}

export interface Readiness {
  modelVersion: string;
  overallScore: number;
  state: ReadinessState;
  confidence: ReadinessConfidence;
  confidenceReason: string;
  dimensions: ReadinessDimensionScore[];
  sectionReadiness: { domain: Domain; score: number }[];
  computedAt: string;
}

export interface SkillPerformance {
  domain: Domain; topic: string; skill: string;
  attempted: number; correct: number; accuracyPct: number; avgTimeSpentSeconds: number;
  label: 'STRONG' | 'STABLE' | 'RISK' | 'CRITICAL' | 'INSUFFICIENT_DATA';
}

export interface DifficultyPoint { difficulty: string; attempted: number; correct: number; accuracyPct: number | null; }

export interface RiskArea { domain: Domain; topic: string; skill?: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; reason: string; timeRelated: boolean; }
export interface PracticeRecommendation {
  priority: 'HIGH' | 'MEDIUM' | 'LOW'; domain: Domain; topic: string; skill?: string;
  targetDifficulty: string; timeIssue: boolean; objective: string; suggestedQuestionCount: number;
}

export interface Diagnosis {
  whatWentWell: string[]; whatWentWrong: string[]; why: string[];
  biggestRisk: string; whatToFixFirst: string; whatToPracticeNext: string; whenToReassess: string;
}

export interface AssessmentResult {
  assessmentId: string; studentId: string; scoredAt: string;
  rawScore: number; maxScore: number; accuracyPct: number;
  attemptedCount: number; correctCount: number; incorrectCount: number; unansweredCount: number;
  skillPerformance: SkillPerformance[];
  difficultyCurve: DifficultyPoint[];
  timeAnalysis: {
    totalTimeSeconds: number; timeUsedSeconds: number; timeRemainingSeconds: number;
    avgTimePerQuestionSeconds: number; unansweredCount: number; unansweredDueToTime: number;
    overInvestmentFlags: unknown[]; underInvestmentFlags: unknown[];
    sectionTimeUsage: { domain: Domain; allocatedShareSeconds: number; actualTimeSeconds: number; questionsCount: number }[];
  };
  answerChangeInsight: { totalChanges: number; correctToWrong: number; wrongToCorrect: number; correctToCorrect: number; netEffect: number; hasSufficientEvidence: boolean; insightText: string | null };
  skipStrategyInsight: { totalSkips: number; effectiveSkips: number; trappedCount: number; insightText: string };
  practiceVsAssessmentGap: { available: boolean; practiceAccuracyPct: number | null; assessmentAccuracyPct: number; gapPct: number | null; note: string };
  readiness: Readiness;
  riskAreas: RiskArea[];
  recommendations: PracticeRecommendation[];
  diagnosis: Diagnosis;
}

export interface AssessmentHistoryEntry {
  assessmentId: string; type: AssessmentType; status: AssessmentStatus;
  overallScore: number | null; readinessState: ReadinessState | null; accuracyPct: number | null;
  submittedAt: string | null; createdAt: string;
}

export interface RecommendationResponse {
  available: boolean;
  message?: string;
  sourceAssessmentId?: string;
  recommendation?: PracticeRecommendation;
  practiceSession?: { id: string; status: string } | null;
}
