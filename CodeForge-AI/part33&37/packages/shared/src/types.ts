import { z } from 'zod';
import {
  AssessmentType, AssessmentStatus, DifficultyLevel,
  ScoreDimension, EvidenceConfidence, RecommendationType, Role,
} from './constants';

/** A single score dimension value (0-100). */
export interface DimensionScore {
  dimension: ScoreDimension;
  score: number;
  evidence: string[];
}

/** Structured AI scoring output. */
export interface ExplainableScore {
  overall: number;
  dimensions: DimensionScore[];
  summary: string;
  confidence: EvidenceConfidence;
  improvementAreas: string[];
}

export interface SkillNode {
  id: string;
  name: string;
  parentId: string | null;
  category: string;
  proficiency: number | null;
  confidence: EvidenceConfidence;
  evidenceCount: number;
}

export interface Weakness {
  skillId: string;
  skillName: string;
  category: string;
  severity: 'CRITICAL' | 'MODERATE' | 'MILD';
  confidence: EvidenceConfidence;
  evidence: string[];
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'UNKNOWN';
}

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  reason: string;
  priority: number;
  targetSkillId?: string;
  metadata?: Record<string, unknown>;
}

export interface ReadinessSnapshot {
  studentId: string;
  overallReadiness: number;
  dimensionScores: DimensionScore[];
  topWeaknesses: Weakness[];
  recommendedActions: Recommendation[];
  evidenceConfidence: EvidenceConfidence;
  assessmentsCompleted: number;
  lastAssessmentDate: string | null;
  trendDirection: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';
}

/* ---- Zod schemas for runtime validation at API boundaries ---- */

export const dimensionScoreSchema = z.object({
  dimension: z.enum(['TECHNICAL', 'PROBLEM_SOLVING', 'COMMUNICATION', 'BEHAVIORAL', 'CONFIDENCE', 'ROLE_RELEVANCE']),
  score: z.number().min(0).max(100),
  evidence: z.array(z.string()),
});

export const explainableScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  dimensions: z.array(dimensionScoreSchema).min(1),
  summary: z.string().min(1).max(2000),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']),
  improvementAreas: z.array(z.string()),
});

export const weaknessSchema = z.object({
  skillId: z.string(),
  skillName: z.string(),
  category: z.string(),
  severity: z.enum(['CRITICAL', 'MODERATE', 'MILD']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']),
  evidence: z.array(z.string()),
  trend: z.enum(['IMPROVING', 'STABLE', 'DECLINING', 'UNKNOWN']),
});

export const recommendationSchema = z.object({
  id: z.string(),
  type: z.enum(['FOCUSED_INTERVIEW', 'SKILL_PRACTICE', 'REATTEMPT_WEAK_CATEGORY', 'COMMUNICATION_DRILL', 'HIGHER_DIFFICULTY', 'REASSESS_READINESS']),
  title: z.string(),
  description: z.string(),
  reason: z.string(),
  priority: z.number().int().min(1).max(10),
  targetSkillId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/* ============================================================
   INTEGRATION TYPES (Feature 37)
   ============================================================ */

export type IntegrationType = 'PREPVISTA';

export type IntegrationStatus =
  | 'PENDING'
  | 'CONNECTING'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'DISCONNECTING'
  | 'DISCONNECTED'
  | 'ERROR';

export type CredentialType =
  | 'API_KEY'
  | 'WEBHOOK_SECRET'
  | 'OAUTH_TOKEN'
  | 'OAUTH_REFRESH_TOKEN'
  | 'SERVICE_ACCOUNT_KEY'
  | 'CERTIFICATE';

export type CredentialStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ROTATING' | 'FAILED';

export type MappingStatus = 'PENDING' | 'VERIFIED' | 'CONFLICT' | 'REJECTED' | 'REVOKED';

export type IdentityMappingMethod =
  | 'EXTERNAL_ID'
  | 'VERIFIED_EMAIL'
  | 'INSTITUTION_ID'
  | 'ADMIN_MANUAL'
  | 'AUTO_MATCHED';

export type SharingScope = 'MINIMAL' | 'STANDARD' | 'DETAILED' | 'FULL';

export type SyncJobType =
  | 'INITIAL'
  | 'INCREMENTAL'
  | 'FULL_RESYNC'
  | 'SINGLE_STUDENT'
  | 'RECONCILIATION';

export type SyncScope =
  | 'ALL_ELIGIBLE'
  | 'SPECIFIC_STUDENTS'
  | 'CHANGED_ONLY'
  | 'FAILED_RETRY';

export type SyncJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';

export type SyncAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'NO_CHANGE';

export type SyncRecordStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'RETRYING';

export type EventSource = 'CODEFORGE' | 'PREPVISTA' | 'SYSTEM';

export type EventStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'FAILED'
  | 'DEAD_LETTER'
  | 'CANCELLED';

export type ErrorCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'VALIDATION'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'DATA_CONFLICT'
  | 'SCHEMA_MISMATCH'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_NOT_FOUND'
  | 'INTERNAL'
  | 'UNKNOWN';

export type ErrorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ErrorStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'IGNORED' | 'AUTO_RESOLVED';

export type AuditActorType = 'USER' | 'SYSTEM' | 'SCHEDULED_JOB' | 'WEBHOOK';

/* ---- Integration Data Contract Types ---- */

export interface TechnicalSkill {
  skillId: string;
  name: string;
  category: string;
  proficiency: number | null;
  confidence: EvidenceConfidence;
  evidenceCount: number;
  lastUpdated: string;
}

export interface MasteryLevel {
  skillId: string;
  skillName: string;
  level: 'EMERGING' | 'DEVELOPING' | 'PROFICIENT' | 'ADVANCED' | 'EXPERT';
  confidence: EvidenceConfidence;
  evidenceSummary: string;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';
}

export interface RoleReadiness {
  role: string;
  overallReadiness: number;
  dimensionScores: Array<{
    dimension: ScoreDimension;
    score: number;
    weight: number;
  }>;
  topGaps: Array<{
    skillId: string;
    skillName: string;
    currentLevel: number;
    targetLevel: number;
    gap: number;
    priority: number;
  }>;
  confidence: EvidenceConfidence;
  lastCalculated: string;
}

export interface SkillGap {
  skillId: string;
  skillName: string;
  category: string;
  currentProficiency: number;
  targetProficiency: number;
  gap: number;
  severity: 'CRITICAL' | 'MODERATE' | 'MILD';
  recommendedActions: string[];
  confidence: EvidenceConfidence;
}

export interface Growth {
  skillId: string;
  skillName: string;
  category: string;
  previousProficiency: number;
  currentProficiency: number;
  change: number;
  periodDays: number;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  confidence: EvidenceConfidence;
  milestones?: Array<{
    date: string;
    proficiency: number;
    eventType: string;
  }>;
}

export interface TechnicalEvidenceSummary {
  assessmentCount: number;
  interviewCount: number;
  projectCount: number;
  totalEvidencePoints: number;
  highConfidenceEvidence: number;
  skillCoverage: number;
  lastEvidenceDate: string | null;
}

export interface AssessmentSummary {
  totalAssessments: number;
  completedAssessments: number;
  averageScore: number | null;
  byType: Record<string, { count: number; avgScore: number | null }>;
  recentTrend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';
  lastAssessmentDate: string | null;
}

export interface InterviewEvidenceSummary {
  totalInterviews: number;
  technicalInterviews: number;
  behavioralInterviews: number;
  avgTechnicalScore: number | null;
  avgBehavioralScore: number | null;
  keyStrengths: string[];
  keyWeaknesses: string[];
  lastInterviewDate: string | null;
}

export interface TechnicalProfile {
  version: string;
  studentId: string;
  externalStudentId?: string;
  organizationId: string;
  roles: string[];
  skills: TechnicalSkill[];
  mastery: MasteryLevel[];
  gaps: SkillGap[];
  readiness: RoleReadiness[];
  growth: Growth[];
  evidenceSummary: TechnicalEvidenceSummary;
  assessmentSummary: AssessmentSummary;
  interviewEvidenceSummary?: InterviewEvidenceSummary;
  metadata: {
    generatedAt: string;
    dataVersion: string;
    contractVersion: string;
    sharingScope: SharingScope;
  };
}

export interface IntegrationEvent {
  id: string;
  integrationId: string;
  eventType: string;
  schemaVersion: string;
  eventId: string;
  source: EventSource;
  occurredAt: string;
  organizationRef: string;
  externalStudentRef?: string;
  dataVersion: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: EventStatus;
  deliveryCount: number;
  lastDeliveryAt?: string;
  nextRetryAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  errorCategory?: string;
  errorMessage?: string;
}

export interface SyncJob {
  id: string;
  integrationId: string;
  type: SyncJobType;
  status: SyncJobStatus;
  scope: SyncScope;
  studentIds: string[];
  triggeredBy: string;
  startedAt?: string;
  completedAt?: string;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  errorSummary?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface IntegrationHealth {
  connection: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'DISCONNECTED';
  identityMapping: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'NOT_CONFIGURED';
  synchronization: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'NOT_STARTED';
  eventDelivery: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'NOT_CONFIGURED';
  pendingEvents: number;
  failedEvents: number;
  lastSuccessfulSync?: string;
  lastError?: string;
  credentialStatus: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING';
}

export type RoleType = Role;
export type AssessmentType = AssessmentType;
export type AssessmentStatus = AssessmentStatus;
export type DifficultyLevel = DifficultyLevel;
