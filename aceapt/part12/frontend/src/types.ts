export type InterventionType =
  | 'TIMED_DRILL'
  | 'CONCEPT_RETEACH'
  | 'WORKED_EXAMPLE'
  | 'GUIDED_PRACTICE'
  | 'TARGETED_PRACTICE'
  | 'SPACED_REVIEW'
  | 'TRANSFER_PRACTICE'
  | 'MICRO_ASSESSMENT'
  | string;

export interface EvidenceItem {
  description: string;
  sampleSize: number;
}

export interface DetectedProblem {
  id: string;
  category: string;
  topic: string;
  evidence: EvidenceItem[];
  confidence: number;
  reason: string;
  baselineAccuracyPct: number;
}

export interface ScoredCandidate {
  type: InterventionType;
  rationale: string;
  score: number;
  flags: string[];
}

export interface InterventionDecision {
  id: string;
  studentId: string;
  problem: DetectedProblem;
  candidates: ScoredCandidate[];
  selected: ScoredCandidate;
  confidence: number;
  reason: string;
}

export interface ExecutionContract {
  type: InterventionType;
  topic: string;
  questionCount?: number;
  timeLimitSec?: number;
  focusAreas: string[];
  steps?: string[];
}

export interface InterventionExecution {
  id: string;
  decisionId: string;
  studentId: string;
  type: InterventionType;
  contract: ExecutionContract;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  startedAt?: string;
  completedAt?: string;
  durationSec?: number;
  result?: { accuracyPct: number; questionsCompleted: number };
}

export interface InterventionOutcome {
  interventionId: string;
  beforeAccuracyPct?: number;
  immediateAccuracyPct?: number;
  retentionAccuracyPct?: number;
  immediateEffectiveness: string;
  retentionEffectiveness?: string;
}

export interface ProfileEntry {
  type: InterventionType;
  attempts: number;
  successes: number;
  avgImmediateDeltaPct: number | null;
  retentionChecks: number;
  avgRetentionDeltaPct: number | null;
  responseLabel: 'HIGH' | 'MEDIUM_HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  nonResponseFlag: boolean;
  saturationFlag: boolean;
}

export interface InterventionProfile {
  studentId: string;
  entries: ProfileEntry[];
}

export interface HistoryItem {
  execution: InterventionExecution;
  outcome: InterventionOutcome | null;
}

export interface NextInterventionResponse {
  decision: InterventionDecision | null;
  explanation?: string;
  coldStart?: boolean;
  message?: string;
}

export interface CompleteResponse {
  execution: InterventionExecution;
  outcome: InterventionOutcome;
  profile: InterventionProfile;
  readiness: number | 'unavailable';
  comparison: { previousAvgImmediateDeltaPct: number; thisAttemptDeltaPct: number; betterThanAverage: boolean } | null;
}

export const DISPLAY_NAME: Record<string, string> = {
  TIMED_DRILL: 'Timed Sprint',
  CONCEPT_RETEACH: 'Concept Refresher',
  WORKED_EXAMPLE: 'Worked Example',
  GUIDED_PRACTICE: 'Guided Practice',
  TARGETED_PRACTICE: 'Targeted Calculation Drill',
  SPACED_REVIEW: 'Spaced Recall',
  TRANSFER_PRACTICE: 'Transfer Practice',
  MICRO_ASSESSMENT: 'Micro Assessment'
};
