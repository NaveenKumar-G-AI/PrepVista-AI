// ============================================================================
// ACEAPT PROOF — Domain Types
// Feature 28: Evidence-Based Readiness Verification & Real-World Performance
// Simulation Engine
// ============================================================================
// Field names deliberately mirror the vocabulary in the Feature 28 build
// spec (evidence, novelty, difficulty, verification state, confidence,
// failure signature) so a reviewer can trace every field back to a named
// requirement in that document.

export const VERIFICATION_STATUSES = [
  'NOT_VERIFIED',
  'EMERGING_EVIDENCE',
  'CONDITIONALLY_VERIFIED',
  'VERIFIED',
  'STRONGLY_VERIFIED',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const EVIDENCE_TYPES = [
  'PRACTICE',
  'RETENTION',
  'TRANSFER',
  'NOVEL',
  'TIMED',
  'DIFFICULTY',
  'CONSISTENCY',
  'SIMULATION',
  'REPEATED_VERIFICATION',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const NOVELTY_LEVELS = ['FAMILIAR', 'RELATED', 'NOVEL', 'HIGHLY_NOVEL'] as const;
export type NoveltyLevel = (typeof NOVELTY_LEVELS)[number];

export const DIFFICULTY_LEVELS = ['EASY', 'MEDIUM', 'HARD', 'TARGET'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const CONFIDENCE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const FAILURE_SIGNATURES = [
  'KNOWLEDGE_GAP',
  'RETENTION_GAP',
  'TRANSFER_GAP',
  'SPEED_GAP',
  'TIME_MANAGEMENT',
  'CONSISTENCY',
  'NOVELTY_HANDLING',
  'DIFFICULTY_HANDLING',
  'LATE_TEST_DEGRADATION',
  'QUESTION_STRATEGY',
] as const;
export type FailureSignatureType = (typeof FAILURE_SIGNATURES)[number];

export const SIMULATION_MODES = [
  'QUICK_VERIFICATION',
  'STANDARD_VERIFICATION',
  'FULL_SIMULATION',
  'FINAL_READINESS_CHECK',
] as const;
export type SimulationMode = (typeof SIMULATION_MODES)[number];

export const SESSION_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const AGING_STATES = ['VERIFIED', 'AGING', 'RECHECK_RECOMMENDED'] as const;
export type AgingState = (typeof AGING_STATES)[number];

/** Evidence quality dimensions, each normalized to [0, 1]. Section 9. */
export interface EvidenceQuality {
  recency: number;
  diversity: number;
  difficulty: number;
  novelty: number;
  independence: number;
  timePressure: number;
  targetRelevance: number;
  repeatedPerformance: number;
}

export interface VerificationEvidence {
  id: string;
  studentId: string;
  sessionId: string | null;
  sourceAttemptId: string | null;
  evidenceType: EvidenceType;
  capability: string;
  difficulty: DifficultyLevel;
  novelty: NoveltyLevel;
  performance: number; // 0..1
  timeTakenMs: number | null;
  expectedTimeMs: number | null;
  isValid: boolean;
  quality: EvidenceQuality;
  createdAt: string;
}

/** Configurable, versioned thresholds — never hardcoded (Section 15). */
export interface VerificationRequirement {
  id: string;
  targetId: string;
  capability: string;
  minPerformance: number;
  minNovelty: NoveltyLevel;
  minConsistency: number; // 0..1, higher = less variance required
  minTimedPerformance: number;
  minConfidenceEvidence: number;
  weight: number;
  isActive: boolean;
  createdAt: string;
}

export interface VerificationFactor {
  name: string;
  score: number; // 0..1
  weight: number;
  threshold: number;
  meetsRequirement: boolean;
  explanation: string;
}

export interface FailureSignature {
  type: FailureSignatureType;
  evidenceRefs: string[];
  explanation: string;
}

export interface EvidenceSummary {
  byType: Partial<Record<EvidenceType, { count: number; avgPerformance: number; avgQuality: number }>>;
  totalCount: number;
  overallQuality: number; // 0..1
}

export interface VerificationResult {
  id: string;
  studentId: string;
  sessionId: string | null;
  targetId: string;
  status: VerificationStatus;
  confidence: ConfidenceLevel;
  factors: VerificationFactor[];
  evidenceSummary: EvidenceSummary;
  failureSignatures: FailureSignature[];
  explanation: string;
  createdAt: string;
}

export interface SimulationProfile {
  id: string;
  mode: SimulationMode;
  questionCount: number;
  difficultyDistribution: Partial<Record<DifficultyLevel, number>>;
  topicDistribution: Record<string, number>;
  timeLimitMs: number;
  noveltyTarget: NoveltyLevel;
  targetCapability: string;
  navigationBehavior: 'FREE' | 'LINEAR';
  scoringRules: { negativeMarking: boolean; partialCredit: boolean };
  createdAt: string;
}

export interface VerificationSession {
  id: string;
  studentId: string;
  targetId: string;
  simulationProfileId: string;
  mode: SimulationMode;
  status: SessionStatus;
  planReason: string;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

/** One recorded response within a session — raw material for time-pressure,
 *  consistency and recovery analysis (Sections 12, 13, 23, 24). */
export interface SessionResponse {
  studentId: string;
  sessionId: string;
  questionIndex: number;
  capability: string;
  difficulty: DifficultyLevel;
  novelty: NoveltyLevel;
  isCorrect: boolean;
  timeTakenMs: number;
  expectedTimeMs: number;
  skipped: boolean;
  changedAnswer: boolean;
  stalled: boolean;
}

export interface TimeSegmentPerformance {
  segment: 'FIRST_QUARTER' | 'MIDDLE_HALF' | 'FINAL_QUARTER';
  accuracy: number;
  avgResponseTimeMs: number;
  responseTimeVarianceMs: number;
}

export interface RecoveryPattern {
  afterDifficultQuestionAccuracy: number;
  baselineAccuracy: number;
  longStallFollowedByInaccuracy: boolean;
  maintainsPerformanceAfterDifficulty: boolean;
}

export interface QuestionStrategySignals {
  avgTimePerQuestionMs: number;
  skipRate: number;
  returnRate: number;
  answerChangeRate: number;
  longStallCount: number;
  rapidResponseCount: number;
}

/** The plan produced by the uncertainty-driven targeted-verification
 *  selector (Section 7) — shown to the student before a simulation starts
 *  (Section 32). */
export interface TargetedVerificationPlan {
  targetId: string;
  capability: string;
  condition: 'TIME_PRESSURE' | 'NOVELTY' | 'STANDARD' | 'CONSISTENCY';
  novelty: NoveltyLevel;
  durationMinutes: number;
  reason: string;
  simulationProfile: Omit<SimulationProfile, 'id' | 'createdAt'>;
  evidenceSufficient: boolean; // Section 20
}

export interface ProofSnapshot {
  id: string;
  studentId: string;
  targetId: string;
  resultId: string;
  status: VerificationStatus;
  confidence: ConfidenceLevel;
  verifiedAt: string | null;
  agingState: AgingState;
  createdAt: string;
}
