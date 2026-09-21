/**
 * Shared domain constants for PrepVista.
 * These are the canonical enums used across backend, AI, and frontend.
 */

export const ROLES = ['STUDENT', 'TPO', 'COLLEGE_ADMIN', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ASSESSMENT_TYPES = [
  'TECHNICAL',
  'BEHAVIORAL',
  'COMMUNICATION',
  'COMBINED',
] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const DIFFICULTY_LEVELS = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const ASSESSMENT_STATUS = [
  'CREATED',
  'IN_PROGRESS',
  'COMPLETED',
  'PROCESSING',
  'FAILED',
  'EXPIRED',
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUS)[number];

/**
 * Scoring dimensions for the explainable scoring engine.
 * The overall score is a weighted combination of these.
 */
export const SCORE_DIMENSIONS = [
  'TECHNICAL',
  'PROBLEM_SOLVING',
  'COMMUNICATION',
  'BEHAVIORAL',
  'CONFIDENCE',
  'ROLE_RELEVANCE',
] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

export const SCORE_WEIGHTS: Record<ScoreDimension, number> = {
  TECHNICAL: 0.3,
  PROBLEM_SOLVING: 0.2,
  COMMUNICATION: 0.15,
  BEHAVIORAL: 0.15,
  CONFIDENCE: 0.1,
  ROLE_RELEVANCE: 0.1,
};

export const EVIDENCE_CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT'] as const;
export type EvidenceConfidence = (typeof EVIDENCE_CONFIDENCE)[number];

export const RECOMMENDATION_TYPES = [
  'FOCUSED_INTERVIEW',
  'SKILL_PRACTICE',
  'REATTEMPT_WEAK_CATEGORY',
  'COMMUNICATION_DRILL',
  'HIGHER_DIFFICULTY',
  'REASSESS_READINESS',
] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const FEATURE_FLAG_STAGES = [
  'INTERNAL',
  'BETA',
  'SMALL_GROUP',
  'COLLEGE_PILOT',
  'GENERAL_AVAILABILITY',
] as const;
export type FeatureFlagStage = (typeof FEATURE_FLAG_STAGES)[number];

export const AADEPT_MIN_EVIDENCE_COUNT = 3;

/* ============================================================
   INTEGRATION CONSTANTS (Feature 37)
   ============================================================ */

export const INTEGRATION_TYPES = ['PREPVISTA'] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

export const INTEGRATION_STATUSES = [
  'PENDING',
  'CONNECTING',
  'ACTIVE',
  'DEGRADED',
  'DISCONNECTING',
  'DISCONNECTED',
  'ERROR',
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const CREDENTIAL_TYPES = [
  'API_KEY',
  'WEBHOOK_SECRET',
  'OAUTH_TOKEN',
  'OAUTH_REFRESH_TOKEN',
  'SERVICE_ACCOUNT_KEY',
  'CERTIFICATE',
] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED', 'ROTATING', 'FAILED'] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const MAPPING_STATUSES = ['PENDING', 'VERIFIED', 'CONFLICT', 'REJECTED', 'REVOKED'] as const;
export type MappingStatus = (typeof MAPPING_STATUSES)[number];

export const IDENTITY_MAPPING_METHODS = [
  'EXTERNAL_ID',
  'VERIFIED_EMAIL',
  'INSTITUTION_ID',
  'ADMIN_MANUAL',
  'AUTO_MATCHED',
] as const;
export type IdentityMappingMethod = (typeof IDENTITY_MAPPING_METHODS)[number];

export const SHARING_SCOPES = ['MINIMAL', 'STANDARD', 'DETAILED', 'FULL'] as const;
export type SharingScope = (typeof SHARING_SCOPES)[number];

export const SYNC_JOB_TYPES = [
  'INITIAL',
  'INCREMENTAL',
  'FULL_RESYNC',
  'SINGLE_STUDENT',
  'RECONCILIATION',
] as const;
export type SyncJobType = (typeof SYNC_JOB_TYPES)[number];

export const SYNC_SCOPES = ['ALL_ELIGIBLE', 'SPECIFIC_STUDENTS', 'CHANGED_ONLY', 'FAILED_RETRY'] as const;
export type SyncScope = (typeof SYNC_SCOPES)[number];

export const SYNC_JOB_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'] as const;
export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number];

export const SYNC_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'NO_CHANGE'] as const;
export type SyncAction = (typeof SYNC_ACTIONS)[number];

export const SYNC_RECORD_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED', 'RETRYING'] as const;
export type SyncRecordStatus = (typeof SYNC_RECORD_STATUSES)[number];

export const EVENT_SOURCES = ['CODEFORGE', 'PREPVISTA', 'SYSTEM'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const EVENT_STATUSES = [
  'PENDING',
  'QUEUED',
  'DELIVERING',
  'DELIVERED',
  'FAILED',
  'DEAD_LETTER',
  'CANCELLED',
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const ERROR_CATEGORIES = [
  'AUTHENTICATION',
  'AUTHORIZATION',
  'VALIDATION',
  'NETWORK',
  'TIMEOUT',
  'RATE_LIMIT',
  'DATA_CONFLICT',
  'SCHEMA_MISMATCH',
  'PERMISSION_DENIED',
  'RESOURCE_NOT_FOUND',
  'INTERNAL',
  'UNKNOWN',
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const ERROR_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

export const ERROR_STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED', 'AUTO_RESOLVED'] as const;
export type ErrorStatus = (typeof ERROR_STATUSES)[number];

export const AUDIT_ACTOR_TYPES = ['USER', 'SYSTEM', 'SCHEDULED_JOB', 'WEBHOOK'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/* ---- Integration Event Types ---- */
export const INTEGRATION_EVENT_TYPES = [
  'technical.profile.updated',
  'technical.skill.updated',
  'technical.readiness.updated',
  'technical.gap.updated',
  'technical.assessment.completed',
  'technical.interview.completed',
  'technical.growth.updated',
  'integration.connected',
  'integration.disconnected',
  'student.linked',
  'student.unlinked',
  'sharing.revoked',
] as const;
export type IntegrationEventType = (typeof INTEGRATION_EVENT_TYPES)[number];

/* ---- Default Configuration ---- */
export const DEFAULT_INTEGRATION_CONFIG = {
  webhookUrl: '',
  apiBaseUrl: 'https://api.prepvista.example.com',
  apiVersion: 'v1',
  timeoutMs: 30000,
  retryPolicy: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
  },
} as const;

export const DEFAULT_SHARING_POLICY = {
  scopes: ['MINIMAL'] as SharingScope[],
  defaultScope: 'MINIMAL' as SharingScope,
  studentOptIn: false,
  autoApprove: false,
  retentionDays: 365,
} as const;

export const CONTRACT_VERSION = 'v1';
export const SUPPORTED_CONTRACT_VERSIONS = ['v1'] as const;
