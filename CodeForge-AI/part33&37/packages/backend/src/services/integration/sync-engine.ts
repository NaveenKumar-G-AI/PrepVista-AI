/**
 * Synchronization Engine
 * Handles initial, incremental, and full resynchronization of technical intelligence
 */
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { integrationService } from './services';
import { buildTechnicalProfile, filterProfileByScope } from './profile-builder';
import { getActiveCredential } from './services';
import {
  SyncJobType,
  SyncScope,
  SyncJobStatus,
  SyncAction,
  SyncRecordStatus,
  SharingScope,
  MappingStatus,
  CONTRACT_VERSION,
  SUPPORTED_CONTRACT_VERSIONS,
} from '@prepvista/shared';
import { NotFoundError, ValidationError } from '../../middleware/error';

interface SyncContext {
  integrationId: string;
  syncJobId: string;
  sharingPolicy: any;
  organizationMapping: any;
  webhookUrl: string;
  apiKey: string;
  contractVersion: string;
}

export class SyncEngine {
  private maxConcurrency = 5;

  async createSyncJob(input: {
    integrationId: string;
    type: SyncJobType;
    scope: SyncScope;
    studentIds?: string[];
    triggeredBy: string;
    idempotencyKey?: string;
  }): Promise<string> {
    // Check for idempotency
    if (input.idempotencyKey) {
      const existing = await prisma.syncJob.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return existing.id;
      }
    }

    const integration = await integrationService.getIntegration(input.integrationId);
    if (!integration.sharingPolicyId) {
      throw new ValidationError('Sharing policy not configured');
    }

    const sharingPolicy = await prisma.sharingPolicy.findUnique({
      where: { id: integration.sharingPolicyId },
    });

    if (!sharingPolicy) {
      throw new ValidationError('Sharing policy not found');
    }

    // Determine eligible students
    let studentIds = input.studentIds || [];

    if (input.scope === 'ALL_ELIGIBLE' || input.scope === 'CHANGED_ONLY') {
      const identityMappings = await prisma.identityMapping.findMany({
        where: {
          integrationId: input.integrationId,
          status: 'VERIFIED',
        },
        select: { codeforgeStudentId: true },
      });
      studentIds = identityMappings.map(m => m.codeforgeStudentId);

      // Filter by sharing policy
      if (!sharingPolicy.autoApprove && sharingPolicy.studentOptIn) {
        // Would filter by student consent - placeholder
      }
    }

    const syncJob = await prisma.syncJob.create({
      data: {
        integrationId: input.integrationId,
        type: input.type,
        scope: input.scope,
        studentIds,
        triggeredBy: input.triggeredBy,
        totalRecords: studentIds.length,
        status: 'PENDING',
        idempotencyKey: input.idempotencyKey,
      },
    });

    logger.info({ syncJobId: syncJob.id, type: input.type, studentCount: studentIds.length }, 'Sync job created');
    return syncJob.id;
  }

  async executeSyncJob(syncJobId: string): Promise<void> {
    const syncJob = await prisma.syncJob.findUnique({
      where: { id: syncJobId },
      include: { integration: true },
    });

    if (!syncJob) {
      throw new NotFoundError('Sync job');
    }

    if (syncJob.status !== 'PENDING') {
      throw new ValidationError(`Sync job is ${syncJob.status}, cannot execute`);
    }

    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      await this.processSyncJob(syncJob);
      await this.completeSyncJob(syncJobId, 'COMPLETED');
    } catch (error) {
      logger.error({ err: error, syncJobId }, 'Sync job failed');
      await this.completeSyncJob(syncJobId, 'FAILED');
      throw error;
    }
  }

  private async processSyncJob(syncJob: any): Promise<void> {
    const context = await this.buildSyncContext(syncJob);

    // Create sync records for each student
    for (const studentId of syncJob.studentIds) {
      const identityMapping = await prisma.identityMapping.findFirst({
        where: {
          integrationId: syncJob.integrationId,
          codeforgeStudentId: studentId,
          status: 'VERIFIED',
        },
      });

      if (!identityMapping) {
        logger.warn({ studentId, syncJobId: syncJob.id }, 'No verified identity mapping, skipping');
        await this.recordSyncRecord(syncJob.id, studentId, '', 'TechnicalProfile', 'SKIPPED', 'No verified identity mapping');
        continue;
      }

      await this.recordSyncRecord(syncJob.id, studentId, identityMapping.externalStudentId, 'TechnicalProfile', 'PENDING');

      try {
        await this.syncStudentProfile(context, studentId, identityMapping.externalStudentId, syncJob.id);
      } catch (error) {
        logger.error({ err: error, studentId, syncJobId: syncJob.id }, 'Student sync failed');
        await this.recordSyncRecord(syncJob.id, studentId, identityMapping.externalStudentId, 'TechnicalProfile', 'FAILED', String(error));
      }
    }
  }

  private async buildSyncContext(syncJob: any): Promise<SyncContext> {
    const integration = syncJob.integration;
    const sharingPolicy = await prisma.sharingPolicy.findUnique({
      where: { id: integration.sharingPolicyId! },
    });

    const organizationMapping = await prisma.organizationMapping.findFirst({
      where: { integrationId: integration.id, status: 'VERIFIED' },
    });

    if (!organizationMapping) {
      throw new ValidationError('No verified organization mapping');
    }

    const webhookUrl = (integration.config as any).webhookUrl;
    if (!webhookUrl) {
      throw new ValidationError('Webhook URL not configured');
    }

    const apiKey = await getActiveCredential(integration.id, 'API_KEY');
    if (!apiKey) {
      throw new ValidationError('API key not configured');
    }

    return {
      integrationId: integration.id,
      syncJobId: syncJob.id,
      sharingPolicy,
      organizationMapping,
      webhookUrl,
      apiKey,
      contractVersion: CONTRACT_VERSION,
    };
  }

  private async syncStudentProfile(
    context: SyncContext,
    studentId: string,
    externalStudentId: string,
    syncJobId: string
  ): Promise<void> {
    // Build technical profile from CodeForge intelligence
    const profile = await buildTechnicalProfile({
      studentId,
      sharingScope: context.sharingPolicy.defaultScope,
      externalStudentId,
      organizationId: context.organizationMapping.codeforgeCollegeId,
      contractVersion: context.contractVersion,
    });

    // Filter by sharing scope
    const filteredProfile = filterProfileByScope(profile, context.sharingPolicy.defaultScope);

    // Create integration event for delivery
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const idempotencyKey = `sync_${syncJobId}_${studentId}_${context.contractVersion}`;

    await prisma.integrationEvent.create({
      data: {
        integrationId: context.integrationId,
        eventType: 'technical.profile.updated',
        schemaVersion: context.contractVersion,
        eventId,
        source: 'CODEFORGE',
        occurredAt: new Date(),
        organizationRef: context.organizationMapping.externalOrgId,
        externalStudentRef: externalStudentId,
        dataVersion: profile.metadata.dataVersion,
        payload: filteredProfile as any,
        idempotencyKey,
        status: 'PENDING',
        nextRetryAt: new Date(),
      },
    });

    // Update sync record
    await this.recordSyncRecord(syncJobId, studentId, externalStudentId, 'TechnicalProfile', 'COMPLETED', undefined, {
      eventId,
      profileVersion: profile.metadata.dataVersion,
    });

    // Trigger delivery
    await this.triggerEventDelivery(context.integrationId, eventId);
  }

  private async recordSyncRecord(
    syncJobId: string,
    studentId: string,
    externalStudentId: string,
    resourceType: string,
    status: SyncRecordStatus,
    error?: string,
    response?: any
  ): Promise<void> {
    await prisma.syncRecord.upsert({
      where: {
        syncJobId_studentId_resourceType: {
          syncJobId,
          studentId,
          resourceType,
        },
      },
      update: {
        status,
        error,
        response: response as any,
        completedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : null,
      },
      create: {
        syncJobId,
        studentId,
        externalStudentId,
        resourceType,
        resourceVersion: CONTRACT_VERSION,
        action: 'UPDATE',
        status,
        error,
        response: response as any,
        completedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : null,
      },
    });
  }

  private async triggerEventDelivery(integrationId: string, eventId: string): Promise<void> {
    // This would be called by the event delivery worker
    // For now, we just mark it as queued
    await prisma.integrationEvent.update({
      where: { eventId },
      data: { status: 'QUEUED', nextRetryAt: new Date() },
    });
  }

  private async completeSyncJob(syncJobId: string, status: SyncJobStatus): Promise<void> {
    const syncJob = await prisma.syncJob.findUnique({ where: { id: syncJobId } });
    if (!syncJob) return;

    const records = await prisma.syncRecord.findMany({ where: { syncJobId } });
    const completed = records.filter(r => r.status === 'COMPLETED').length;
    const failed = records.filter(r => r.status === 'FAILED').length;

    const finalStatus = failed > 0 && completed > 0 ? 'PARTIAL' : status;

    await prisma.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        processedRecords: completed,
        failedRecords: failed,
        errorSummary: failed > 0 ? { sampleErrors: records.filter(r => r.status === 'FAILED').slice(0, 5).map(r => r.error) } : null,
      },
    });

    // Update integration last sync
    await prisma.integration.update({
      where: { id: syncJob.integrationId },
      data: { lastSyncAt: new Date(), lastError: failed > 0 ? 'Sync completed with errors' : null },
    });

    logger.info({ syncJobId, status: finalStatus, completed, failed }, 'Sync job completed');
  }

  async getSyncJobStatus(syncJobId: string): Promise<any> {
    const syncJob = await prisma.syncJob.findUnique({
      where: { id: syncJobId },
      include: {
        records: { orderBy: { createdAt: 'desc' } },
        integration: { select: { id: true, name: true, status: true } },
      },
    });

    if (!syncJob) {
      throw new NotFoundError('Sync job');
    }

    return syncJob;
  }

  async listSyncJobs(integrationId: string, page = 1, limit = 20): Promise<{
    jobs: any[];
    total: number;
    totalPages: number;
  }> {
    const [jobs, total] = await Promise.all([
      prisma.syncJob.findMany({
        where: { integrationId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { records: true },
      }),
      prisma.syncJob.count({ where: { integrationId } }),
    ]);

    return { jobs, total, totalPages: Math.ceil(total / limit) };
  }
}

export const syncEngine = new SyncEngine();