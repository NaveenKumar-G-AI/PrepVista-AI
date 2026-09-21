export const READINESS_DIMENSION_KEYS = [
  "concept",
  "accuracy",
  "speed",
  "time_pressure",
  "mixed_topic",
  "novel_question",
  "retention",
  "consistency",
  "assessment_condition",
  "recovery",
  "question_selection",
  "time_allocation",
] as const;
export type ReadinessDimensionKey = (typeof READINESS_DIMENSION_KEYS)[number];

export type ReadinessState =
  | "INSUFFICIENT_EVIDENCE"
  | "EARLY_EVIDENCE"
  | "DEVELOPING"
  | "NEAR_READY"
  | "CONDITIONALLY_READY"
  | "STRONGLY_READY";

export type DimensionStatus = "READY" | "DEVELOPING" | "HIGH_RISK";
export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";
export type PracticeMode = "topic_practice" | "timed_practice" | "mixed_practice" | "realistic_simulation";
export type Difficulty = "easy" | "medium" | "hard";

export interface DimensionScore {
  dimensionKey: ReadinessDimensionKey;
  score: number;
  status: DimensionStatus;
  confidence: ConfidenceLevel;
  evidenceSummary: string;
}

export interface ReadinessGap {
  dimensionKey: ReadinessDimensionKey;
  severity: "DEVELOPING" | "HIGH_RISK";
  description: string;
  evidenceIds: string[];
}

export interface Evidence {
  id: string;
  dimensionKey: ReadinessDimensionKey | null;
  claim: string;
  observation: string;
  sampleSize: number;
  timeWindow: string;
  confidence: ConfidenceLevel;
  supportingData: Record<string, unknown>;
}

export interface ReadinessContributor {
  dimensionKey: ReadinessDimensionKey;
  delta: number;
  direction: "up" | "down";
}

export interface ReadinessSnapshot {
  id: string;
  studentId: string;
  profileId: string | null;
  previousSnapshotId: string | null;
  createdAt: string;
  overallScore: number;
  overallState: ReadinessState;
  confidence: { level: ConfidenceLevel; score: number; limitingFactors: string[] };
  evidenceCount: number;
  simulationIds: string[];
  dimensions: DimensionScore[];
  gaps: ReadinessGap[];
  evidence: Evidence[];
  contributors: ReadinessContributor[];
}

export interface AssessmentProfile {
  id: string;
  name: string;
  assessmentType: string;
  durationMinutes: number;
  questionCount: number;
  sections: Array<{ name: string; topicIds: string[]; questionCount: number }>;
  difficultyDistribution: Record<Difficulty, number>;
  negativeMarking: { enabled: boolean; penaltyFraction: number };
  scoringRules: { correctMarks: number; unansweredMarks: number };
  targetScore: number | null;
  questionTimeExpectationSeconds: number;
}

export interface DeliverableQuestion {
  questionId: string;
  section: string;
  sequenceOrder: number;
  expectedTimeSeconds: number;
  prompt: string;
  options: { id: string; text: string }[];
}

export interface StartSimulationResult {
  simulationId: string;
  durationMinutes: number;
  blueprintIssues: string[];
  questions: DeliverableQuestion[];
}

export interface SimulationSummary {
  id: string;
  profileId: string;
  practiceMode: PracticeMode;
  status: "not_started" | "in_progress" | "submitted" | "abandoned";
  startedAt: string | null;
  submittedAt: string | null;
  totalScore: number | null;
  maxScore: number | null;
  accuracy: number | null;
  questionCount: number;
  createdAt: string;
}

export type SpeedAccuracyBucket =
  | "HIGH_ACCURACY_HIGH_SPEED"
  | "HIGH_ACCURACY_LOW_SPEED"
  | "LOW_ACCURACY_HIGH_SPEED"
  | "LOW_ACCURACY_LOW_SPEED";

export interface SimulationPostmortem {
  simulationId: string;
  score: number | null;
  maxScore: number | null;
  accuracyPct: number | null;
  answeredCount: number;
  unansweredCount: number;
  totalQuestions: number;
  speedAccuracy: { buckets: Record<SpeedAccuracyBucket, number>; sampleSize: number };
  timeAllocation: {
    totalTimeSpentSeconds: number;
    avgTimePerQuestionSeconds: number;
    timeByDifficulty: Record<string, number>;
    unansweredCount: number;
    sinkObservations: string[];
  };
  questionSelection: { score: number; sampleSize: number; breakdown: Record<string, number> };
  topicSwitching: {
    postSwitchAccuracy: number | null;
    steadyStateAccuracy: number | null;
    accuracyCost: number | null;
    switchCount: number;
    hasGap: boolean;
    observation: string | null;
  };
  recovery: { postErrorRecoveryRate: number | null; errorEventCount: number; longestPostErrorMissStreak: number };
  degradation: {
    firstQuarterAccuracy: number | null;
    middleHalfAccuracy: number | null;
    finalQuarterAccuracy: number | null;
    hasDegradation: boolean;
    supportingSignals: string[];
  };
}

export interface Explanation {
  text: string;
  source: "template" | "ai_polished";
}

export interface TrendPoint {
  createdAt: string;
  overallScore: number;
  overallState: ReadinessState;
}

export interface Intervention {
  id: string;
  gapDimensionKey: string;
  interventionType: string;
  status: "recommended" | "in_progress" | "completed";
  createdAt: string;
  resultingSimulationId: string | null;
}
