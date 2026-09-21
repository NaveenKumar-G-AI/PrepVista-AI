// Mirrors backend/src/types/domain.ts. Kept deliberately minimal - only
// what the components in this module actually render or submit.

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type ScopeType = 'OVERALL' | 'DOMAIN' | 'TOPIC' | 'SKILL' | 'SUBSKILL' | 'DIFFICULTY' | 'QUESTION_TYPE';

export interface ScopeKey {
  scopeType: ScopeType;
  scopeId: string;
}

export type TrainingMode =
  | 'FLUENCY'
  | 'RECOGNITION'
  | 'STRATEGY'
  | 'CALCULATION'
  | 'READING'
  | 'BALANCED'
  | 'DECISION'
  | 'PACING'
  | 'PLACEMENT_SIMULATION';

export type SessionState = 'READY' | 'ACTIVE' | 'PAUSED' | 'PRESSURE_ADJUSTMENT' | 'COMPLETED' | 'ABANDONED';

export type BottleneckType =
  | 'READING'
  | 'RECOGNITION'
  | 'STRATEGY'
  | 'CALCULATION'
  | 'VERIFICATION'
  | 'DECISION'
  | 'RUSHING'
  | 'HESITATION'
  | 'TIME_WASTING'
  | 'KNOWLEDGE_GAP'
  | 'UNKNOWN';

export type AttemptDecision = 'ATTEMPT' | 'SKIP' | 'RETURN_LATER';

export interface SpeedSession {
  id: string;
  studentId: string;
  mode: TrainingMode;
  state: SessionState;
  scope: ScopeKey;
  targetTimeMs: number | null;
  guardrailAccuracy: number;
}

export interface QuestionContext {
  questionId: string;
  skillId: string;
  difficulty: Difficulty;
  questionType?: string;
}

export interface SubmitAttemptInput {
  question: QuestionContext;
  responseTimeMs: number;
  correct: boolean;
  independent: boolean;
  hintLevel: number;
  clientAttemptId: string;
  decision?: AttemptDecision;
  confidenceRating?: number;
}

export interface AttemptFeedback {
  status: string;
  detail: string;
}

export interface TrainingPolicyDecision {
  signal: BottleneckType | 'STABLE_IMPROVING' | 'INSUFFICIENT_DATA';
  pressureAction: 'INCREASE' | 'DECREASE' | 'HOLD';
  nextMode: TrainingMode;
  nextTargetMs: number | null;
  message: string;
}

export interface SubmitAttemptResult {
  attempt: { id: string; responseTimeMs: number; correct: boolean };
  feedback: AttemptFeedback;
  policy: TrainingPolicyDecision;
  coachingNote: string | null;
  session: SpeedSession;
}

export interface SpeedProfile {
  averageMs: number;
  medianMs: number;
  accuracy: number;
  expectedTimeMs: number | null;
  sampleSize: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface BottleneckAssessment {
  type: BottleneckType;
  evidence: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface BottleneckReport {
  top: BottleneckAssessment;
  all: BottleneckAssessment[];
}

export interface SpeedTarget {
  currentTargetMs: number;
  baselineMs: number;
  guardrailAccuracy: number;
}

export interface PacingSummary {
  requiredPaceMsPerQuestion: number;
  actualPaceMsPerQuestion: number;
  paceStatus: 'AHEAD' | 'ON_TRACK' | 'BEHIND';
  accuracy: number;
  message: string;
}

export interface SessionSummary {
  headline: string;
  time: { beforeSec: number; afterSec: number };
  accuracy: { before: number; after: number };
  mainImprovement: string;
  mainCaution: string | null;
  nextFocus: string;
}

export interface SpeedHistoryPoint {
  label: string;
  avgSec: number;
  accuracy: number;
}

export interface FrontierPoint {
  avgTimeMs: number;
  accuracy: number;
  sampleSize: number;
}

export interface SafeSpeedZone {
  minMs: number;
  maxMs: number;
  guardrail: number;
}

export interface SpeedFrontierResult {
  frontier: FrontierPoint[];
  safeZone: SafeSpeedZone | null;
}
