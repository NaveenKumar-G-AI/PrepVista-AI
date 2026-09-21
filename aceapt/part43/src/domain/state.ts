import { CapabilityLabel, DiagnosticConfig, EvidenceConfidence, ResponseRecord, SkillId, StudentProfileRef } from './types';

export type AdaptiveMode = 'explore' | 'investigate' | 'verify' | 'challenge' | 'transfer';
export type SessionStatus = 'not_started' | 'in_progress' | 'paused' | 'completed' | 'abandoned';

export interface SkillEvidence {
  skillId: SkillId;

  // --- capability estimate (see engine/evidence.ts for the update rule) ---
  estimate: number; // continuous ability, same logit-like scale as Question.difficultyRating
  uncertainty: number; // higher = less certain
  surpriseWindow: number[]; // rolling (actual - predicted) values, used to detect instability
  evidenceCount: number;
  correctCount: number;
  incorrectCount: number;
  isUnstable: boolean; // contradictory-evidence flag (spec sections 13, 34, 93)
  capabilityLabel: CapabilityLabel;
  confidenceLabel: EvidenceConfidence;

  // --- difficulty / challenge tracking (spec sections 14, 18-20) ---
  upperBoundaryDifficulty: number; // highest difficulty answered correctly so far, this session
  recentCorrectStreakAtOrAboveBoundary: number;

  // --- transfer tracking (spec sections 15, 58, 79) ---
  transferEvidenceCount: number;
  transferCorrectCount: number;
  potentialTransferGap: boolean;

  // --- speed tracking (spec sections 24-28, 56) ---
  speedStatus: 'fast' | 'moderate' | 'slow' | 'unknown';
  relativeResponseTimeEma: number; // exponential moving average, 1.0 == "as expected"
  speedCheckDone: boolean;
  needsSpeedCheck: boolean; // slow-but-correct, fluency not yet confirmed

  // --- rushing / careless-error tracking (spec section 26) ---
  fastWrongStreak: number;
  needsRushInvestigation: boolean;

  // --- confidence calibration (spec section 29; only meaningful if confidence is reported) ---
  highConfidenceWrongStreak: number;
  lowConfidenceCorrectStreak: number;
  calibrationFlag: 'none' | 'overconfidence' | 'underconfidence';

  // --- historical evidence blending (spec sections 41-43) ---
  initializedFromHistory: boolean;
  historicalLabel?: CapabilityLabel;

  history: ResponseRecord[];
  lastUpdatedAt: string;
}

export interface CoverageState {
  domain: string;
  questionsAsked: number;
  minimumRequired: number;
  satisfied: boolean;
}

export interface FatigueState {
  responseTimeTrend: 'increasing' | 'stable' | 'decreasing';
  accuracyTrend: 'declining' | 'stable' | 'improving';
  consecutiveFastGuesses: number;
  severity: 'none' | 'mild' | 'moderate' | 'high';
  recommendPause: boolean;
}

export interface AdaptiveDecisionLogEntry {
  id: string;
  questionId: string;
  targetSkillId: SkillId;
  mode: AdaptiveMode;
  reason: string;
  evidenceUsedSummary: string;
  informationValue: number;
  selectedAt: string;
}

export interface AdaptiveDiagnosticState {
  sessionId: string;
  student: StudentProfileRef;
  config: DiagnosticConfig;
  status: SessionStatus;

  skillEvidence: Record<SkillId, SkillEvidence>;
  coverage: Record<string, CoverageState>;
  exposure: Record<string, number>; // questionId -> times seen
  patternExposure: Record<string, number>; // tag -> times seen

  recentResponses: ResponseRecord[]; // rolling window, most recent last
  fatigue: FatigueState;
  decisionLog: AdaptiveDecisionLogEntry[];
  askedQuestionIds: string[];
  questionsAsked: number;

  startedAt: string;
  updatedAt: string;
  completedAt?: string;

  /** The question currently handed to the student and awaiting a response. */
  pendingQuestionId?: string;
  pendingPresentedAt?: string;
}
