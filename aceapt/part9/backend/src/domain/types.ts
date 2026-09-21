// ============================================================
// FEATURE 9 - CORE DOMAIN TYPES
// ============================================================
// This file is the single source of truth for the shapes used across
// the simulation engine. If you wire this into the real ACEAPT
// codebase, this is the first file to reconcile against your existing
// skill taxonomy and question/assessment models (see INTEGRATION.md).

export type SkillId =
  | 'arithmetic'
  | 'logical_reasoning'
  | 'data_interpretation'
  | 'verbal_ability'
  | 'number_system'
  | 'algebra'
  | 'ratio_proportion'
  | 'percentage'
  | 'probability'
  | 'geometry';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type SimulationMode =
  | 'QUICK_SIMULATION'
  | 'STANDARD_SIMULATION'
  | 'FULL_SIMULATION'
  | 'CUSTOM_SIMULATION';

export type PressureMode = 'NORMAL' | 'COMPETITIVE' | 'STRICT' | 'HIGH_PRESSURE';

export type SimulationStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';

export type QuestionEventType =
  | 'OPEN'
  | 'START'
  | 'ANSWER'
  | 'ANSWER_CHANGED'
  | 'SKIP'
  | 'RETURN'
  | 'SUBMIT';

export type MasteryState = 'STABLE' | 'VERIFIED' | 'AT_RISK' | 'UNKNOWN';

export type InsightSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type DecisionOutcome =
  | 'CORRECT_EFFICIENT'
  | 'CORRECT_INEFFICIENT'
  | 'WRONG_QUICK'
  | 'WRONG_EXCESSIVE_TIME'
  | 'SKIPPED_GOOD_DECISION'
  | 'SKIPPED_MISSED_OPPORTUNITY';

export interface NegativeMarkingRule {
  correct: number;
  wrong: number;
  skipped: number;
}

export interface SkillDistributionEntry {
  skill: SkillId;
  count: number;
}

/**
 * Difficulty is an ORDERED sequence (length === questionCount), not just
 * counts. Section 10 of the spec is explicit: "Do not generate random
 * difficulty spikes. Difficulty should follow the selected blueprint."
 * Skill order, by contrast, is intentionally shuffled-but-smoothed by
 * QuestionSelectionService - see section 9 ("unpredictable but fair").
 */
export interface SimulationBlueprint {
  id: string;
  name: string;
  mode: SimulationMode;
  durationSeconds: number;
  questionCount: number;
  skillDistribution: SkillDistributionEntry[];
  difficultySequence: Difficulty[];
  negativeMarking: NegativeMarkingRule;
  allowSkip: boolean;
  allowReturn: boolean;
  hideTopicLabels: boolean;
  pressureMode: PressureMode;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  skill: SkillId;
  difficulty: Difficulty;
  prompt: string;
  options: QuestionOption[];
  correctOptionId: string;
  expectedSolveTimeSeconds: number;
}

/** Question as sent to the client - never includes correctOptionId. */
export interface PublicQuestion {
  id: string;
  sequence: number;
  skill: SkillId | null;
  difficulty: Difficulty | null;
  prompt: string;
  options: QuestionOption[];
}

export interface SimulationQuestionRef {
  questionId: string;
  sequence: number;
  skill: SkillId;
  difficulty: Difficulty;
}

export interface SimulationEvent {
  id: string;
  simulationId: string;
  questionId: string | null;
  type: QuestionEventType;
  timestamp: number; // epoch ms, always server-generated
  metadata?: Record<string, unknown>;
}

export interface AnswerRecord {
  questionId: string;
  selectedOptionId: string | null;
  previousOptionIds: string[];
  isCorrect: boolean | null;
  firstOpenedAt: number | null;
  answeredAt: number | null;
  timeSpentSeconds: number;
  skipped: boolean;
  returned: boolean;
  remainingTimeFractionAtAnswer: number | null;
}

export interface Simulation {
  id: string;
  studentId: string;
  blueprintId: string;
  mode: SimulationMode;
  pressureMode: PressureMode;
  status: SimulationStatus;
  questionRefs: SimulationQuestionRef[];
  answers: Record<string, AnswerRecord>;
  startedAt: number;
  completedAt: number | null;
  durationSeconds: number;
  negativeMarking: NegativeMarkingRule;
  hideTopicLabels: boolean;
  currentQuestionIndex: number;
}

export interface DimensionScores {
  accuracy: number;
  speed: number;
  decisionQuality: number;
  timeManagement: number;
  consistency: number;
  recovery: number;
  endurance: number;
}

export interface SimulationResult {
  simulationId: string;
  overallScore: number;
  dimensions: DimensionScores;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  rawScore: number;
  maxScore: number;
}

export interface SimulationInsight {
  id: string;
  simulationId: string;
  signalType: string;
  severity: InsightSeverity;
  confidence: number;
  evidence: Record<string, unknown>;
  message: string;
}

export interface PerformanceCurvePoint {
  segment: 'beginning' | 'middle' | 'end';
  accuracy: number;
  avgTimeSeconds: number;
}

export interface SimulationReport {
  simulationId: string;
  studentId: string;
  overallScore: number;
  dimensions: DimensionScores;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  performanceCurve: PerformanceCurvePoint[];
  insights: SimulationInsight[];
  topStrengths: string[];
  topBottlenecks: string[];
  nextAction: { source: 'FEATURE_7'; label: string } | null;
  comparisonToPrevious: SimulationComparison | null;
}

export interface SimulationComparison {
  previousSimulationId: string;
  overallScoreDelta: number;
  dimensionDeltas: DimensionScores;
  narrative: string;
}

export interface SimulationHistoryEntry {
  simulationId: string;
  completedAt: number | null;
  overallScore: number;
  dimensions: DimensionScores;
}
