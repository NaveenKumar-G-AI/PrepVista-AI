// Shared domain types for the Speed Training Engine (ACEAPT Feature 50).
// Keep this file free of I/O concerns - it is the vocabulary every other
// module (core algorithms, integrations, repositories, services, API) speaks.

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export enum SpeedPerformanceState {
  FAST_ACCURATE = 'FAST_ACCURATE',
  FAST_INACCURATE = 'FAST_INACCURATE',
  SLOW_ACCURATE = 'SLOW_ACCURATE',
  SLOW_INACCURATE = 'SLOW_INACCURATE',
  // Extensions beyond the spec's four headline states, used internally so a
  // question isn't forced into "fast" or "slow" when it was simply on pace.
  ON_PACE_ACCURATE = 'ON_PACE_ACCURATE',
  ON_PACE_INACCURATE = 'ON_PACE_INACCURATE',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
}

export enum BottleneckType {
  READING = 'READING',
  RECOGNITION = 'RECOGNITION',
  STRATEGY = 'STRATEGY',
  CALCULATION = 'CALCULATION',
  VERIFICATION = 'VERIFICATION',
  DECISION = 'DECISION',
  RUSHING = 'RUSHING',
  HESITATION = 'HESITATION',
  TIME_WASTING = 'TIME_WASTING',
  KNOWLEDGE_GAP = 'KNOWLEDGE_GAP',
  UNKNOWN = 'UNKNOWN',
}

export enum TrainingMode {
  FLUENCY = 'FLUENCY',
  RECOGNITION = 'RECOGNITION',
  STRATEGY = 'STRATEGY',
  CALCULATION = 'CALCULATION',
  READING = 'READING',
  BALANCED = 'BALANCED',
  DECISION = 'DECISION',
  PACING = 'PACING',
  PLACEMENT_SIMULATION = 'PLACEMENT_SIMULATION',
}

export enum PressureLevel {
  NO_TIMER = 'NO_TIMER',
  SOFT_TIMER = 'SOFT_TIMER',
  TARGET_TIME = 'TARGET_TIME',
  STRICT_TIME = 'STRICT_TIME',
  PLACEMENT_SIMULATION = 'PLACEMENT_SIMULATION',
}

export enum SessionState {
  READY = 'READY',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  PRESSURE_ADJUSTMENT = 'PRESSURE_ADJUSTMENT',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}

export enum SpeedQuality {
  SAFE = 'SAFE',
  IMPROVING = 'IMPROVING',
  RISKY = 'RISKY',
  UNSTABLE = 'UNSTABLE',
  UNKNOWN = 'UNKNOWN',
}

export enum AttemptDecision {
  ATTEMPT = 'ATTEMPT',
  SKIP = 'SKIP',
  RETURN_LATER = 'RETURN_LATER',
}

export type EvidenceConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type ExpectedTimeSource = 'CALIBRATED' | 'PERSONAL_BASELINE' | 'UNKNOWN';
export type NoveltyLevel = 'FAMILIAR' | 'TRANSFER' | 'NOVEL';
export type ScopeType = 'OVERALL' | 'DOMAIN' | 'TOPIC' | 'SKILL' | 'SUBSKILL' | 'DIFFICULTY' | 'QUESTION_TYPE';

export interface ScopeKey {
  scopeType: ScopeType;
  scopeId: string;
}

export interface QuestionContext {
  questionId: string;
  skillId: string;
  subskillId?: string;
  domain?: string;
  topic?: string;
  difficulty: Difficulty;
  questionType?: string;
  problemLength?: {
    wordCount?: number;
    dataPoints?: number;
    steps?: number;
  };
}

export interface StageTimings {
  readingMs?: number | null;
  strategyMs?: number | null;
  calculationMs?: number | null;
  verificationMs?: number | null;
}

/** What the client submits for one attempt. Everything beyond the total
 * response time and correctness is optional - the engine only ever uses
 * instrumentation that is actually present (spec: "never fabricate"). */
export interface NewSpeedAttempt {
  sessionId: string;
  studentId: string;
  question: QuestionContext;
  responseTimeMs: number;
  correct: boolean;
  independent: boolean;
  hintLevel: number;
  noveltyLevel?: NoveltyLevel;
  stage?: StageTimings;
  decision?: AttemptDecision;
  confidenceRating?: number; // optional self-report, 1 (guessing) - 5 (certain)
  retryCount?: number;
  idleMs?: number;
  /** Client-generated id used to make attempt submission idempotent under
   * retries / double-submits. Required. */
  clientAttemptId: string;
}

export interface SpeedAttemptRecord extends NewSpeedAttempt {
  id: string;
  expectedTimeMs: number | null;
  expectedTimeSource: ExpectedTimeSource;
  relativeSpeed: number | null;
  performanceState: SpeedPerformanceState;
  createdAt: Date;
}

export interface SpeedBaseline {
  scope: ScopeKey;
  sampleSize: number;
  averageMs: number;
  medianMs: number;
  accuracy: number;
  confidence: EvidenceConfidence;
  updatedAt: Date;
}

export interface BottleneckAssessment {
  type: BottleneckType;
  scope: ScopeKey;
  evidence: string;
  confidence: EvidenceConfidence;
  metrics: Record<string, number>;
}

export interface TrainingPolicyDecision {
  signal: BottleneckType | 'STABLE_IMPROVING' | 'INSUFFICIENT_DATA';
  pressureAction: 'INCREASE' | 'DECREASE' | 'HOLD';
  nextMode: TrainingMode;
  nextTargetMs: number | null;
  message: string;
  evidence: string[];
  /** True only for notable transitions (mode switch, rushing/hesitation/
   * knowledge-gap/fatigue signals, or session end) - never per question, to
   * keep AI usage cheap (spec section 81). */
  requiresCoachingNarrative: boolean;
}

export interface SpeedSession {
  id: string;
  studentId: string;
  mode: TrainingMode;
  pressureLevel: PressureLevel;
  state: SessionState;
  scope: ScopeKey;
  targetTimeMs: number | null;
  guardrailAccuracy: number;
  goalId?: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PacingSession {
  id: string;
  studentId: string;
  speedSessionId: string | null;
  mode: 'PACING' | 'PLACEMENT_SIMULATION';
  totalQuestions: number;
  timeBudgetMs: number;
  timeElapsedMs: number;
  questionsCompleted: number;
  correctCount: number;
  state: SessionState;
  startedAt: Date;
  completedAt: Date | null;
}
