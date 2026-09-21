import {
  BottleneckType,
  EvidenceConfidence,
  ExpectedTimeSource,
  NewSpeedAttempt,
  PacingSession,
  PressureLevel,
  ScopeKey,
  SessionState,
  SpeedAttemptRecord,
  SpeedPerformanceState,
  SpeedSession,
  TrainingMode,
} from '../../types/domain';

export interface NewSpeedSessionInput {
  studentId: string;
  mode: TrainingMode;
  pressureLevel: PressureLevel;
  state: SessionState;
  scope: ScopeKey;
  targetTimeMs: number | null;
  guardrailAccuracy: number;
  goalId?: string | null;
}

export type SpeedSessionPatch = Partial<Pick<SpeedSession, 'targetTimeMs' | 'mode' | 'state' | 'completedAt' | 'pressureLevel'>>;

export interface NewAttemptForRepo extends NewSpeedAttempt {
  expectedTimeMs: number | null;
  expectedTimeSource: ExpectedTimeSource;
  relativeSpeed: number | null;
  performanceState: SpeedPerformanceState;
}

export interface SpeedProfileRecord {
  studentId: string;
  scope: ScopeKey;
  averageMs: number;
  medianMs: number;
  accuracy: number;
  expectedTimeMs: number | null;
  expectedTimeSource: ExpectedTimeSource;
  relativeSpeed: number | null;
  sampleSize: number;
  confidence: EvidenceConfidence;
  updatedAt: Date;
}

export interface NewBottleneckRecord {
  studentId: string;
  scope: ScopeKey;
  type: BottleneckType;
  evidence: string;
  confidence: EvidenceConfidence;
  metrics: Record<string, number>;
  status: 'ACTIVE' | 'MONITORING' | 'RESOLVED';
}

export interface BottleneckRecord extends NewBottleneckRecord {
  id: string;
  detectedAt: Date;
}

export interface SpeedTargetRecord {
  studentId: string;
  scope: ScopeKey;
  currentTargetMs: number;
  baselineMs: number;
  guardrailAccuracy: number;
  lastRampedAt: Date | null;
}

export interface NewPacingSessionInput {
  studentId: string;
  mode: 'PACING' | 'PLACEMENT_SIMULATION';
  totalQuestions: number;
  timeBudgetMs: number;
  speedSessionId?: string | null;
}

export interface SpeedRepository {
  createSession(input: NewSpeedSessionInput): Promise<SpeedSession>;
  getSession(id: string): Promise<SpeedSession | null>;
  updateSession(id: string, patch: SpeedSessionPatch): Promise<SpeedSession>;

  addAttempt(input: NewAttemptForRepo): Promise<SpeedAttemptRecord>;
  listAttemptsBySession(sessionId: string): Promise<SpeedAttemptRecord[]>;
  listRecentAttemptsByScope(studentId: string, scope: ScopeKey, limit: number): Promise<SpeedAttemptRecord[]>;

  upsertProfile(profile: SpeedProfileRecord): Promise<void>;
  getProfile(studentId: string, scope: ScopeKey): Promise<SpeedProfileRecord | null>;

  saveBottleneck(b: NewBottleneckRecord): Promise<BottleneckRecord>;
  listBottlenecks(studentId: string, scope?: ScopeKey): Promise<BottleneckRecord[]>;

  upsertTarget(t: SpeedTargetRecord): Promise<void>;
  getTarget(studentId: string, scope: ScopeKey): Promise<SpeedTargetRecord | null>;

  createPacingSession(input: NewPacingSessionInput): Promise<PacingSession>;
  getPacingSession(id: string): Promise<PacingSession | null>;
  updatePacingSession(id: string, patch: Partial<PacingSession>): Promise<PacingSession>;
}

export function scopeKeyString(scope: ScopeKey): string {
  return `${scope.scopeType}:${scope.scopeId}`;
}

/** Shared scope-matching logic so both the in-memory and Drizzle
 * repositories filter attempts by scope the same way. */
export function attemptMatchesScope(attempt: SpeedAttemptRecord, scope: ScopeKey): boolean {
  switch (scope.scopeType) {
    case 'OVERALL':
      return true;
    case 'SKILL':
      return attempt.question.skillId === scope.scopeId;
    case 'SUBSKILL':
      return attempt.question.subskillId === scope.scopeId;
    case 'DOMAIN':
      return attempt.question.domain === scope.scopeId;
    case 'TOPIC':
      return attempt.question.topic === scope.scopeId;
    case 'DIFFICULTY':
      return attempt.question.difficulty === scope.scopeId;
    case 'QUESTION_TYPE':
      return attempt.question.questionType === scope.scopeId;
    default:
      return false;
  }
}
