export type Difficulty = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  0: "Foundation",
  1: "Easy",
  2: "Easy+",
  3: "Medium",
  4: "Medium+",
  5: "Hard",
  6: "Hard+",
  7: "Expert",
};

export interface DifficultyProfile {
  level: Difficulty;
  conceptComplexity: number;
  reasoningComplexity: number;
  calculationComplexity: number;
  timePressure: number;
  distractorQuality: number;
  transferDifficulty: number;
}

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect?: boolean; // never trust this on the client — it's stripped server-side before sending in practice, kept optional for type-safety only
}

export interface Question {
  id: string;
  skillId: string;
  subtopic: string;
  difficulty: DifficultyProfile;
  questionType: string;
  expectedTimeSeconds: number;
  prompt: string;
  options: QuestionOption[];
}

export interface Hint {
  level: number;
  label: string;
  text: string;
}

export interface AdaptationEvent {
  atQuestionIndex: number;
  trigger: string;
  previousDifficulty: Difficulty;
  newDifficulty: Difficulty;
  focusDimension?: string;
  message: string;
}

export interface PracticeSession {
  id: string;
  studentId: string;
  mode: string;
  objective: string;
  objectiveReason: string;
  skillFocus: string[];
  plan: { questionType: string; count: number }[];
  questionsServed: string[];
  currentDifficulty: Difficulty;
  status: string;
}

export interface AttemptResult {
  attempt: {
    id: string;
    isCorrect: boolean;
    errorCategory: string | null;
    hintsUsed: number;
    difficultyAtAttempt: DifficultyProfile;
    relativeSpeed: string;
  };
  question: Question;
  isCorrect: boolean;
  interpretation: string;
  explanation: {
    whatHappened?: string;
    whereReasoningFailed?: string;
    correctReasoning?: string;
    howToAvoid?: string;
    retryPrompt?: string;
    whyCorrect?: string;
    efficientApproach?: string;
    shortcut?: string;
    transferChallenge?: string;
  };
  adaptationEvent: AdaptationEvent | null;
  retrySuggestion: { type: string; rationale: string } | null;
  masteryState: string;
  masteryRationale: string;
  fatigue: { fatigued: boolean; signals: string[]; recommendation: string };
  planExhausted: boolean;
}

export interface DashboardData {
  currentGoal: string;
  objective: string;
  reason: string;
  recommendedSession: { questionType: string; count: number }[];
  accuracy: number;
  speed: number;
  consistency: number;
  recentImprovement: { skillId: string; skillName: string; direction: "UP" | "DOWN" | "FLAT"; note: string }[];
  nextBestAction: string;
  hasActiveSession: boolean;
  activeSessionId: string | null;
}

export interface MasteryOverviewEntry {
  skill: { id: string; name: string; subtopic: string };
  state: {
    attemptCount: number;
    recentAccuracy: number;
    averageTimeSeconds: number;
    masteryState: string;
    currentDifficulty: Difficulty;
  };
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
