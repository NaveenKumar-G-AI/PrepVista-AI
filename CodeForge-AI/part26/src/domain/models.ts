/**
 * CodeForge AI — Skill Signal Intelligence Engine
 * Domain model. This is the canonical vocabulary every other module imports.
 */

export type StudentId = string; // uuid
export type SkillId = string; // e.g. 'state_reasoning'
export type CorrelationId = string; // uuid, threaded through one evidence->signal pipeline run

export enum EvidenceType {
  CHALLENGE_RESULT = 'CHALLENGE_RESULT',
  CORRECTNESS_RESULT = 'CORRECTNESS_RESULT',
  COMPLEXITY_RESULT = 'COMPLEXITY_RESULT',
  QUALITY_RESULT = 'QUALITY_RESULT',
  REASONING_RESULT = 'REASONING_RESULT',
  DEBUGGING_RESULT = 'DEBUGGING_RESULT',
  UNDERSTANDING_RESULT = 'UNDERSTANDING_RESULT',
  TRANSFER_RESULT = 'TRANSFER_RESULT',
  ASSESSMENT_RESULT = 'ASSESSMENT_RESULT',
}

export enum EvidenceStatus {
  VALID = 'VALID',
  INVALID = 'INVALID',
  SUSPICIOUS = 'SUSPICIOUS',
  DISPUTED = 'DISPUTED',
  EXCLUDED = 'EXCLUDED',
}

export enum AssessmentTier {
  PRACTICE = 'PRACTICE',
  ASSESSMENT = 'ASSESSMENT',
  INTERVIEW = 'INTERVIEW',
  PROJECT = 'PROJECT',
  DIAGNOSTIC = 'DIAGNOSTIC',
}

export enum SkillState {
  UNKNOWN = 'UNKNOWN',
  INTRODUCED = 'INTRODUCED',
  DEVELOPING = 'DEVELOPING',
  PRACTICED = 'PRACTICED',
  PROFICIENT = 'PROFICIENT',
  MASTERED = 'MASTERED',
  AT_RISK = 'AT_RISK',
  REGRESSING = 'REGRESSING',
  UNCERTAIN = 'UNCERTAIN',
}

export enum Trend {
  IMPROVING = 'IMPROVING',
  STABLE = 'STABLE',
  DECLINING = 'DECLINING',
  VOLATILE = 'VOLATILE',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
}

export enum Freshness {
  RECENT = 'RECENT',
  AGING = 'AGING',
  STALE = 'STALE',
  VERY_STALE = 'VERY_STALE',
  UNKNOWN = 'UNKNOWN',
}

/**
 * What an upstream system (execution engine, complexity analyzer, code-quality
 * checker, reasoning verifier, debugging system, review system...) hands us.
 * This is untrusted input — see engine/normalize.ts for validation.
 */
export interface RawEvidenceInput {
  sourceType: EvidenceType;
  sourceId: string; // id of the originating submission/challenge/review/etc.
  studentId: StudentId;
  skillIds: SkillId[]; // one evidence event may speak to more than one skill
  payload: Record<string, unknown>; // shape depends on sourceType — see normalize.ts
  difficulty?: number; // 0-1, defaults per policy
  contextGroup?: string; // challenge family / representation, drives diversity + transfer
  assessmentTier?: AssessmentTier;
  occurredAt: string; // ISO timestamp
  evidenceVersion?: number; // bump to correct/replace a prior submission of the same source
}

/** Common representation every evidence type is normalized into. Preserves the raw value. */
export interface NormalizedEvidence {
  evidenceId: string; // deterministic — see normalize.ts#evidenceIdentity
  sourceType: EvidenceType;
  sourceId: string;
  studentId: StudentId;
  skillId: SkillId;
  rawValue: unknown;
  normalizedValue: number; // 0-1
  status: EvidenceStatus;
  difficulty: number; // 0-1
  contextGroup: string;
  assessmentTier: AssessmentTier;
  sourceReliability: number; // 0-1, how much this evidence TYPE is trusted
  independence: number; // 0-1, 1 = fully independent observation
  isTransfer: boolean;
  occurredAt: string;
  evidenceVersion: number;
  policyVersion: string;
}

export interface AggregationResult {
  skillId: SkillId;
  studentId: StudentId;
  evidenceCount: number;
  validEvidenceCount: number;
  weightedSignal: number; // 0-1, all valid evidence
  recentWeightedSignal: number | null; // 0-1, recent window only
  historicalWeightedSignal: number | null; // 0-1, older-than-recent window
  diversity: number; // 0-1
  distinctContexts: number;
  transferEvidenceCount: number;
  transferWeightedSignal: number | null;
  lastDemonstratedAt: string | null;
  firstObservedAt: string | null;
  avgSourceReliability: number;
  contradictionMagnitude: number; // 0-1, 0 = no contradiction
  excludedCount: number;
}

export interface SkillSignal {
  skillId: SkillId;
  studentId: StudentId;
  signal: number; // 0-1
  confidence: number; // 0-1
  state: SkillState;
  trend: Trend;
  freshness: Freshness;
  evidenceCount: number;
  diversity: number;
  transferConfidence: number; // 0-1
  retention: number | null; // 0-1, null = not enough data to assess
  lastDemonstratedAt: string | null;
  firstObservedAt: string | null;
  contradiction: boolean;
  modelVersion: string;
  policyVersion: string;
  updatedAt: string;
  version: number; // optimistic concurrency token
}

export interface SkillSignalHistoryPoint {
  skillId: SkillId;
  studentId: StudentId;
  signal: number;
  confidence: number;
  state: SkillState;
  trend: Trend;
  recordedAt: string;
  policyVersion: string;
}

export interface SkillSignalExplanation {
  skillId: SkillId;
  studentId: StudentId;
  summary: string;
  evidenceHighlights: string[];
  generatedAt: string;
}

export interface AuditEvent {
  correlationId: CorrelationId;
  studentId: StudentId | null;
  skillId: SkillId | null;
  eventType:
    | 'evidence_received'
    | 'evidence_validated'
    | 'evidence_rejected'
    | 'evidence_deduplicated'
    | 'signal_created'
    | 'signal_updated'
    | 'state_changed'
    | 'confidence_changed'
    | 'trend_changed';
  details: Record<string, unknown>;
  occurredAt: string;
}

export interface TechnicalProfile {
  studentId: StudentId;
  skills: Record<SkillId, SkillSignal>;
  strengths: SkillId[];
  weaknesses: SkillId[];
  uncertainties: SkillId[];
  improving: SkillId[];
  declining: SkillId[];
  transferGaps: SkillId[];
  retentionRisks: SkillId[];
  overallConfidence: number;
  modelVersion: string;
  generatedAt: string;
}

export const MODEL_VERSION = 'skill-signal-engine-v1';
