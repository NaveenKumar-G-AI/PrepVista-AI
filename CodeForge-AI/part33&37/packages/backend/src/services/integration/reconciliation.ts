/**
 * Reconciliation Service
 * Detects and resolves divergence between CodeForge and PrepVista
 */
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { buildTechnicalProfile } from './profile-builder';
import { eventDelivery } from './event-delivery';
import { SyncRecordStatus, CONTRACT_VERSION } from '@prepvista/shared';

export class ReconciliationService {
  /**
   * Creates a reconciliation sync job to detect divergence
   */
  async createReconciliationJob(
    integrationId: string,
    actorId: string
  ): Promise<string> {
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
      include: { sharingPolicy: true },
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    if (!integration.sharingPolicyId) {
      throw new Error('Sharing policy not configured');
    }

    // Get all verified identity mappings
    const identityMappings = await prisma.identityMapping.findMany({
      where: {
        integrationId,
        status: 'VERIFIED',
      },
    });

    if (identityMappings.length === 0) {
      throw new Error('No verified identity mappings found');
    }

    // Create reconciliation sync job
    const syncJob = await prisma.syncJob.create({
      data: {
        integrationId,
        type: 'RECONCILIATION',
        scope: 'ALL_ELIGIBLE',
        studentIds: identityMappings.map(m => m.codeforgeStudentId),
        triggeredBy: actorId,
        totalRecords: identityMappings.length,
        status: 'PENDING',
      },
    });

    logger.info({ integrationId, syncJobId: syncJob.id, studentCount: identityMappings.length }, 'Reconciliation job created');
    return syncJob.id;
  }

  /**
   * Checks for divergence between CodeForge and last known PrepVista state
   * Returns students with detected divergence
   */
  async detectDivergence(integrationId: string): Promise<Array<{
    studentId: string;
    externalStudentId: string;
    codeforgeVersion: string;
    lastSyncedVersion: string;
    divergentFields: string[];
    lastSyncAt: Date | null;
  }>> {
    const identityMappings = await prisma.identityMapping.findMany({
      where: {
        integrationId,
        status: 'VERIFIED',
      },
    });

    const divergent: Array<{
      studentId: string;
      externalStudentId: string;
      codeforgeVersion: string;
      lastSyncedVersion: string;
      divergentFields: string[];
      lastSyncAt: Date | null;
    }> = [];

    for (const mapping of identityMappings) {
      // Get last successful sync record
      const lastSync = await prisma.syncRecord.findFirst({
        where: {
          syncJob: { integrationId },
          studentId: mapping.codeforgeStudentId,
          resourceType: 'TechnicalProfile',
          status: 'COMPLETED',
        },
        orderBy: { completedAt: 'desc' },
      });

      if (!lastSync) {
        // Never synced - full divergence
        divergent.push({
          studentId: mapping.codeforgeStudentId,
          externalStudentId: mapping.externalStudentId,
          codeforgeVersion: CONTRACT_VERSION,
          lastSyncedVersion: 'never',
          divergentFields: ['ALL'],
          lastSyncAt: null,
        });
        continue;
      }

      // Build current CodeForge profile
      const currentProfile = await buildTechnicalProfile({
        studentId: mapping.codeforgeStudentId,
        sharingScope: 'FULL',
        externalStudentId: mapping.externalStudentId,
        organizationId: mapping.integrationId, // Would be collegeId
        contractVersion: CONTRACT_VERSION,
      });

      // Compare with last synced version
      const lastVersion = lastSync.response?.profileVersion as string || 'unknown';
      const currentVersion = currentProfile.metadata.dataVersion;

      if (currentVersion !== lastVersion) {
        // Version mismatch - potential divergence
        const divergentFields = this.compareProfiles(
          currentProfile,
          lastSync.payload as any
        );

        divergent.push({
          studentId: mapping.codeforgeStudentId,
          externalStudentId: mapping.externalStudentId,
          codeforgeVersion: currentVersion,
          lastSyncedVersion: lastVersion,
          divergentFields,
          lastSyncAt: lastSync.completedAt,
        });
      }
    }

    return divergent;
  }

  /**
   * Compares two technical profiles for divergence
   */
  private compareProfiles(current: any, previous: any): string[] {
    const divergent: string[] = [];

    // Compare skills
    if (JSON.stringify(current.skills) !== JSON.stringify(previous?.skills)) {
      divergent.push('skills');
    }

    // Compare mastery
    if (JSON.stringify(current.mastery) !== JSON.stringify(previous?.mastery)) {
      divergent.push('mastery');
    }

    // Compare gaps
    if (JSON.stringify(current.gaps) !== JSON.stringify(previous?.gaps)) {
      divergent.push('gaps');
    }

    // Compare readiness
    if (JSON.stringify(current.readiness) !== JSON.stringify(previous?.readiness)) {
      divergent.push('readiness');
    }

    // Compare growth
    if (JSON.stringify(current.growth) !== JSON.stringify(previous?.growth)) {
      divergent.push('growth');
    }

    // Compare evidence summary
    if (JSON.stringify(current.evidenceSummary) !== JSON.stringify(previous?.evidenceSummary)) {
      divergent.push('evidenceSummary');
    }

    // Compare assessment summary
    if (JSON.stringify(current.assessmentSummary) !== JSON.stringify(previous?.assessmentSummary)) {
      divergent.push('assessmentSummary');
    }

    return divergent;
  }

  /**
   * Resolves divergence by triggering a fresh sync for divergent students
   */
  async resolveDivergence(
    integrationId: string,
    studentIds: string[],
    actorId: string
  ): Promise<string> {
    const syncJob = await prisma.syncJob.create({
      data: {
        integrationId,
        type: 'RECONCILIATION',
        scope: 'SPECIFIC_STUDENTS',
        studentIds,
        triggeredBy: actorId,
        totalRecords: studentIds.length,
        status: 'PENDING',
      },
    });

    logger.info({ integrationId, syncJobId: syncJob.id, studentCount: studentIds.length }, 'Divergence resolution sync job created');
    return syncJob.id;
  }

  /**
   * Gets reconciliation status for an integration
   */
  async getReconciliationStatus(integrationId: string): Promise<{
    totalStudents: number;
    syncedStudents: number;
    divergentStudents: number;
    neverSyncedStudents: number;
    lastReconciliationAt: Date | null;
    lastReconciliationResult: 'CLEAN' | 'DIVERGENCE_DETECTED' | 'ERROR' | 'NEVER_RUN';
  }> {
    const identityMappings = await prisma.identityMapping.findMany({
      where: {
        integrationId,
        status: 'VERIFIED',
      },
    });

    const totalStudents = identityMappings.length;

    const lastReconciliation = await prisma.syncJob.findFirst({
      where: {
        integrationId,
        type: 'RECONCILIATION',
      },
      orderBy: { createdAt: 'desc' },
    });

    let syncedStudents = 0;
    let divergentStudents = 0;
    let neverSyncedStudents = 0;
    let lastReconciliationResult: 'CLEAN' | 'DIVERGENCE_DETECTED' | 'ERROR' | 'NEVER_RUN' = 'NEVER_RUN';

    if (lastReconciliation) {
      const records = await prisma.syncRecord.findMany({
        where: { syncJobId: lastReconciliation.id },
      });

      syncedStudents = records.filter(r => r.status === 'COMPLETED').length;
      divergentStudents = records.filter(r => r.status === 'FAILED').length;
      neverSyncedStudents = records.filter(r => r.status === 'SKIPPED').length;

      if (lastReconciliation.status === 'COMPLETED') {
        lastReconciliationResult = divergentStudents > 0 ? 'DIVERGENCE_DETECTED' : 'CLEAN';
      } else if (lastReconciliation.status === 'FAILED') {
        lastReconciliationResult = 'ERROR';
      }
    }

    return {
      totalStudents,
      syncedStudents,
      divergentStudents,
      neverSyncedStudents,
      lastReconciliationAt: lastReconciliation?.completedAt || null,
      lastReconciliationResult,
    };
  }
}

export const reconciliationService = new ReconciliationService();