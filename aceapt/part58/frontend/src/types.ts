/**
 * Mirrors the shapes these components need from the backend (see
 * ../../src/types.ts). Kept as a small hand-maintained subset rather than a
 * build-time import from the backend package, since the two normally ship
 * separately — once wired into the real ACEAPT frontend, prefer generating
 * this from the backend's OpenAPI/schema instead of hand-syncing it.
 */

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

export type ConfidenceBand = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export type InsightConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ScenarioOption {
  id: string;
  label: string;
}

export interface DecisionScenario {
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  expectedTimeSeconds: number;
  elapsedTimeSeconds: number;
  remainingTestTimeSeconds?: number;
  prompt: string;
  options: ScenarioOption[];
}

export interface RiskPolicyDisplay {
  correctReward: number;
  wrongPenalty: number;
  blankValue: number;
}

export interface DecisionInsightDisplay {
  headline: string;
  body: string;
  confidence: InsightConfidence;
  practiceCount?: number;
}

export interface PostMockSummary {
  solvedConfidently: number;
  informedGuesses: number;
  blindGuesses: number;
  strategicSkips: number;
  potentiallyUnnecessarySkips: number;
  timeOverruns: number;
  answerChanges: number;
}

export interface DecisionTimelineEntry {
  label: string;
  action: string;
  outcome?: 'correct' | 'incorrect' | 'ungraded';
}

export interface DecisionDimension {
  label: 'Strong' | 'Developing' | 'Needs attention';
  sampleSize: number;
}

export interface DecisionProfileDisplay {
  elimination?: DecisionDimension;
  informedGuessing?: DecisionDimension;
  strategicSkipping?: DecisionDimension;
  timeAllocation?: DecisionDimension;
  confidenceCalibration?: DecisionDimension;
  answerSwitching?: DecisionDimension;
  currentFocus?: string;
}
