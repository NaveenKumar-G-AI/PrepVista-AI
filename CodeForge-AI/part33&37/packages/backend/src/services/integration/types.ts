/**
 * Integration Service Types
 * Internal types for the integration service
 */
import { Integration, IntegrationCredential, OrganizationMapping, IdentityMapping, SharingPolicy, SyncJob, SyncRecord, IntegrationEvent, WebhookDelivery, IntegrationError, IntegrationAudit } from '@prisma/client';
import { TechnicalProfile, IntegrationHealth, SharingScope, SyncJobType, SyncScope, SyncJobStatus, EventStatus, ErrorCategory, ErrorSeverity, IdentityMappingMethod, MappingStatus } from '@prepvista/shared';

export interface IntegrationWithRelations extends Integration {
  credentials: IntegrationCredential[];
  mappings: OrganizationMapping[];
  identityMappings: IdentityMapping[];
  sharingPolicy: SharingPolicy | null;
}

export interface CreateIntegrationInput {
  collegeId: string;
  name: string;
  type: 'PREPVISTA';
  externalId?: string;
  config: {
    webhookUrl: string;
    apiBaseUrl?: string;
    apiVersion?: string;
    timeoutMs?: number;
    retryPolicy?: {
      maxRetries: number;
      baseDelayMs: number;
      maxDelayMs: number;
      backoffMultiplier: number;
    };
  };
}

export interface UpdateIntegrationInput {
  name?: string;
  externalId?: string | null;
  config?: Partial<CreateIntegrationInput['config']>;
  status?: Integration['status'];
}

export interface CredentialInput {
  name: string;
  type: IntegrationCredential['type'];
  value: string;
  expiresAt?: Date | null;
}

export interface OrganizationMappingInput {
  codeforgeCollegeId: string;
  externalOrgId: string;
  externalOrgName?: string;
}

export interface IdentityMappingInput {
  codeforgeStudentId: string;
  externalStudentId: string;
  externalEmail?: string;
  method: IdentityMappingMethod;
}

export interface SharingPolicyInput {
  name: string;
  description?: string;
  scopes: SharingScope[];
  defaultScope: SharingScope;
  studentOptIn: boolean;
  autoApprove: boolean;
  retentionDays: number;
}

export interface SyncJobInput {
  integrationId: string;
  type: SyncJobType;
  scope: SyncScope;
  studentIds?: string[];
  triggeredBy: string;
  idempotencyKey?: string;
}

export interface EventDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  errorCategory?: ErrorCategory;
  durationMs: number;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface SyncResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: Array<{ studentId: string; resourceType: string; error: string }>;
}

export interface TechnicalProfileInput {
  studentId: string;
  sharingScope: SharingScope;
}