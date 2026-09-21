import {
  ConfidenceCalibration,
  ConfidenceLevel,
  Difficulty,
  DifficultyDimension,
  ErrorCategory,
  MasteryState,
  PerformanceInterpretation,
  PracticeMode,
  PracticeObjective,
  QuestionHealth,
  QuestionSource,
  QuestionType,
  RelativeSpeed,
  Role,
  SessionStatus,
} from "./enums";

/** Multi-dimensional difficulty representation (§9). `level` is the ordinal
 * ladder position used for adaptive stepping; the dimensions let selection
 * and generation reason about *why* a question is hard, not just how hard. */
export interface DifficultyProfile {
  level: Difficulty;
  conceptComplexity: 1 | 2 | 3 | 4 | 5;
  reasoningComplexity: 1 | 2 | 3 | 4 | 5;
  calculationComplexity: 1 | 2 | 3 | 4 | 5;
  timePressure: 1 | 2 | 3 | 4 | 5;
  distractorQuality: 1 | 2 | 3 | 4 | 5;
  transferDifficulty: 1 | 2 | 3 | 4 | 5;
}

export interface Skill {
  id: string;
  domain: string;
  topic: string;
  subtopic: string;
  name: string;
  prerequisites: string[];
}

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  /** If wrong, which error category picking this option is evidence of.
   * This is what makes error classification deterministic and explainable
   * instead of a black box (§11, §15). */
  misconception?: ErrorCategory;
  misconceptionNote?: string;
}

export interface Hint {
  level: 1 | 2 | 3 | 4 | 5; // 5 = FINAL / complete explanation
  label: string;
  text: string;
}

export interface QuestionExplanation {
  correctReasoning: string;
  efficientApproach?: string;
  shortcut?: string;
  howToAvoidMistake?: string;
}

export interface Question {
  id: string;
  domain: string;
  topic: string;
  subtopic: string;
  skillId: string;
  prerequisites: string[];
  difficulty: DifficultyProfile;
  questionType: QuestionType;
  cognitiveDemand: "RECALL" | "APPLICATION" | "ANALYSIS" | "TRANSFER";
  expectedTimeSeconds: number;
  prompt: string;
  options: QuestionOption[];
  explanation: QuestionExplanation;
  hints: Hint[];
  commonMisconceptions: string[];
  errorCategoriesCovered: ErrorCategory[];
  tags: string[];
  version: number;
  qualityStatus: QuestionHealth;
  source: QuestionSource;
  templateId?: string;
  examRelevance?: number; // 0-1, used by selection scoring
  createdAt: string;
}

/** Practice memory (§30) — the persistent, per-skill state the whole engine reasons from. */
export interface SkillPracticeState {
  studentId: string;
  skillId: string;
  lastPracticed: string | null;
  attemptCount: number;
  correctCount: number;
  recentAccuracy: number; // 0-1, rolling window
  averageTimeSeconds: number;
  confidenceCalibration: ConfidenceCalibration;
  errorDistribution: Partial<Record<ErrorCategory, number>>;
  difficultyExposure: Partial<Record<Difficulty, number>>;
  hintUsageRate: number; // avg hints per attempt
  streak: number; // consecutive correct, can be negative for consecutive incorrect
  masteryState: MasteryState;
  nextReview: string | null;
  currentDifficulty: Difficulty;
  suspectedMemorization: boolean;
}

export interface Attempt {
  id: string;
  studentId: string;
  sessionId: string;
  questionId: string;
  skillId: string;
  selectedOptionId: string | null;
  isCorrect: boolean;
  timeToStartMs: number;
  totalTimeMs: number;
  expectedTimeMs: number;
  relativeSpeed: RelativeSpeed;
  hintsUsed: number;
  confidence: ConfidenceLevel | null;
  errorCategory: ErrorCategory | null;
  performanceInterpretation: PerformanceInterpretation | null;
  difficultyAtAttempt: DifficultyProfile;
  questionIndexInSession: number;
  createdAt: string;
}

export interface SessionPlanItem {
  questionType: QuestionType;
  count: number;
  skillFocus?: string;
}

export interface AdaptationEvent {
  atQuestionIndex: number;
  trigger: string;
  previousDifficulty: Difficulty;
  newDifficulty: Difficulty;
  focusDimension?: DifficultyDimension;
  newObjectiveFocus?: string;
  message: string;
  createdAt: string;
}

export interface PracticeSession {
  id: string;
  studentId: string;
  mode: PracticeMode;
  objective: PracticeObjective;
  objectiveReason: string;
  skillFocus: string[];
  plan: SessionPlanItem[];
  planIndex: number; // pointer into plan for "what type comes next"
  questionsServed: string[];
  attempts: string[];
  currentDifficulty: Difficulty;
  currentFocusDimension?: DifficultyDimension;
  status: SessionStatus;
  startedAt: string;
  completedAt: string | null;
  adaptationLog: AdaptationEvent[];
  /** Set only in VERIFY_MASTERY sessions: the Standard→Application→Transfer→Timed pointer (§25). */
  verificationStage?: number;
  /** Server clock timestamp for when the current (unanswered) question was
   * served — the authoritative source for totalTimeMs, since client-reported
   * timings are never trusted for anything that affects adaptation (§42). */
  currentQuestionServedAt: string | null;
  /** Hints already used on the current (unanswered) question. */
  currentQuestionHintsUsed: number;
}

export interface MasteryEvidenceRecord {
  id: string;
  studentId: string;
  skillId: string;
  evidenceType: "DIVERSITY" | "APPLICATION" | "TRANSFER" | "TIMED" | "HINT_INDEPENDENCE" | "CONSISTENCY";
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface AuthedUser {
  studentId: string;
  role: Role;
}

export interface DashboardRecommendation {
  currentGoal: string;
  objective: PracticeObjective;
  reason: string;
  recommendedSession: SessionPlanItem[];
  accuracy: number;
  speed: number;
  consistency: number;
  recentImprovement: { skillId: string; skillName: string; direction: "UP" | "DOWN" | "FLAT"; note: string }[];
  nextBestAction: string;
  hasActiveSession: boolean;
  activeSessionId: string | null;
}

export interface SessionSummary {
  sessionId: string;
  whatImproved: string[];
  whatRemainsWeak: string[];
  mainErrorPattern: string;
  speedStatus: string;
  accuracyStatus: string;
  masteryStatus: string;
  nextBestAction: string;
  totalQuestions: number;
  correctCount: number;
  adaptationCount: number;
}
