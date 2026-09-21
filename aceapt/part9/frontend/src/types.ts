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
export type PressureMode = 'NORMAL' | 'COMPETITIVE' | 'STRICT' | 'HIGH_PRESSURE';

export interface Blueprint {
  id: string;
  name: string;
  mode: string;
  durationSeconds: number;
  questionCount: number;
  pressureMode: PressureMode;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface PublicQuestion {
  id: string;
  sequence: number;
  skill: SkillId | null;
  difficulty: Difficulty | null;
  prompt: string;
  options: QuestionOption[];
}

export interface SimulationProgress {
  answered: number;
  skipped: number;
  untouched: number;
}

export interface PublicSimulationView {
  id: string;
  mode: string;
  pressureMode: PressureMode;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  questionCount: number;
  currentQuestionIndex: number;
  durationSeconds: number;
  remainingSeconds: number;
  startedAt: number;
  progress: SimulationProgress;
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

export interface PerformanceCurvePoint {
  segment: 'beginning' | 'middle' | 'end';
  accuracy: number;
  avgTimeSeconds: number;
}

export interface SimulationInsight {
  id: string;
  signalType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  evidence: Record<string, unknown>;
  message: string;
}

export interface SimulationComparison {
  previousSimulationId: string;
  overallScoreDelta: number;
  dimensionDeltas: DimensionScores;
  narrative: string;
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

export interface SimulationHistoryEntry {
  simulationId: string;
  completedAt: number | null;
  overallScore: number;
  dimensions: DimensionScores;
}

/** Local-only question state, layered on top of what the server tracks. */
export type QuestionLocalState = 'untouched' | 'answered' | 'skipped';
