/**
 * Integration Service
 * Core service for managing PrepVista integration lifecycle
 */
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { encrypt, decrypt } from './encryption';
import { Integration, IntegrationCredential, SharingPolicy, OrganizationMapping, IdentityMapping, IntegrationAudit } from '@prisma/client';
import {
  IntegrationType,
  IntegrationStatus,
  CredentialType,
  MappingStatus,
  IdentityMappingMethod,
  SharingScope,
  CONTRACT_VERSION,
} from '@prepvista/shared';
import { NotFoundError, ValidationError, AuthorizationError, ConflictError } from '../../middleware/error';

export class IntegrationService {
  /* ============================================================
     INTEGRATION LIFECYCLE
     ============================================================ */

  async createIntegration(input: {
    collegeId: string;
    name: string;
    type: IntegrationType;
    externalId?: string;
    config: Record<string, unknown>;
    actorId: string;
  }): Promise<Integration> {
    // Check if integration already exists for this college+type
    const existing = await prisma.integration.findUnique({
      where: { collegeId_type: { collegeId: input.collegeId, type: input.type } },
    });

    if (existing) {
      throw new ConflictError(`Integration ${input.type} already exists for this college`);
    }

    const integration = await prisma.integration.create({
      data: {
        collegeId: input.collegeId,
        name: input.name,
        type: input.type,
        externalId: input.externalId,
        status: 'PENDING',
        config: input.config as any,
      },
    });

    await this.recordAudit(integration.id, 'created', input.actorId, 'USER', {
      name: input.name,
      type: input.type,
    });

    logger.info({ integrationId: integration.id, collegeId: input.collegeId }, 'Integration created');
    return integration;
  }

  async getIntegration(id: string): Promise<Integration> {
    const integration = await prisma.integration.findUnique({
      where: { id },
    });

    if (!integration) {
      throw new NotFoundError('Integration');
    }

    return integration;
  }

  async getIntegrationByCollege(collegeId: string, type: IntegrationType = 'PREPVISTA'): Promise<Integration | null> {
    return prisma.integration.findUnique({
      where: { collegeId_type: { collegeId, type } },
    });
  }

  async updateIntegration(id: string, input: {
    name?: string;
    externalId?: string | null;
    config?: Record<string, unknown>;
    status?: IntegrationStatus;
    actorId: string;
  }): Promise<Integration> {
    const integration = await this.getIntegration(id);

    const updated = await prisma.integration.update({
      where: { id },
      data: {
        name: input.name ?? integration.name,
        externalId: input.externalId !== undefined ? input.externalId : integration.externalId,
        config: input.config ? { ...integration.config as any, ...input.config } : integration.config,
        status: input.status ?? integration.status,
      },
    });

    await this.recordAudit(id, 'updated', input.actorId, 'USER', {
      name: input.name,
      status: input.status,
    });

    logger.info({ integrationId: id }, 'Integration updated');
    return updated;
  }

  async connectIntegration(id: string, actorId: string): Promise<Integration> {
    const integration = await this.getIntegration(id);

    if (integration.status === 'ACTIVE') {
      throw new ValidationError('Integration already active');
    }

    const updated = await prisma.integration.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        connectedAt: new Date(),
        lastError: null,
        errorCount: 0,
      },
    });

    await this.recordAudit(id, 'connected', actorId, 'USER', {});
    logger.info({ integrationId: id }, 'Integration connected');
    return updated;
  }

  async disconnectIntegration(id: string, actorId: string): Promise<Integration> {
    const integration = await this.getIntegration(id);

    // Revoke all active credentials
    await prisma.integrationCredential.updateMany({
      where: { integrationId: id, status: 'ACTIVE' },
      data: { status: 'REVOKED', updatedAt: new Date() },
    });

    const updated = await prisma.integration.update({
      where: { id },
      data: {
        status: 'DISCONNECTED',
        disconnectedAt: new Date(),
      },
    });

    await this.recordAudit(id, 'disconnected', actorId, 'USER', {});
    logger.info({ integrationId: id }, 'Integration disconnected');
    return updated;
  }

  /* ============================================================
     CREDENTIAL MANAGEMENT
     ============================================================ */

  async createCredential(input: {
    integrationId: string;
    name: string;
    type: CredentialType;
    value: string;
    expiresAt?: Date | null;
    actorId: string;
  }): Promise<IntegrationCredential> {
    const integration = await this.getIntegration(input.integrationId);

    const encrypted = encrypt(input.value);

    const credential = await prisma.integrationCredential.create({
      data: {
        integrationId: input.integrationId,
        name: input.name,
        type: input.type,
        value: encrypted,
        status: 'ACTIVE',
        expiresAt: input.expiresAt,
      },
    });

    // Never log the value
    await this.recordAudit(input.integrationId, 'credential_created', input.actorId, 'USER', {
      credentialId: credential.id,
      type: input.type,
      name: input.name,
    });

    logger.info({ integrationId: input.integrationId, credentialId: credential.id }, 'Credential created');
    return credential;
  }

  async rotateCredential(id: string, newValue: string, actorId: string): Promise<IntegrationCredential> {
    const credential = await prisma.integrationCredential.findUnique({ where: { id } });
    if (!credential) {
      throw new NotFoundError('Credential');
    }

    const encrypted = encrypt(newValue);

    const updated = await prisma.integrationCredential.update({
      where: { id },
      data: {
        value: encrypted,
        rotatedAt: new Date(),
        status: 'ACTIVE',
      },
    });

    await this.recordAudit(credential.integrationId, 'credential_rotated', actorId, 'USER', {
      credentialId: id,
      type: credential.type,
    });

    logger.info({ credentialId: id }, 'Credential rotated');
    return updated;
  }

  async revokeCredential(id: string, actorId: string): Promise<IntegrationCredential> {
    const credential = await prisma.integrationCredential.findUnique({ where: { id } });
    if (!credential) {
      throw new NotFoundError('Credential');
    }

    const updated = await prisma.integrationCredential.update({
      where: { id },
      data: {
        status: 'REVOKED',
        updatedAt: new Date(),
      },
    });

    await this.recordAudit(credential.integrationId, 'credential_revoked', actorId, 'USER', {
      credentialId: id,
      type: credential.type,
    });

    logger.info({ credentialId: id }, 'Credential revoked');
    return updated;
  }

  async getActiveCredential(integrationId: string, type: CredentialType): Promise<string | null> {
    const credential = await prisma.integrationCredential.findFirst({
      where: {
        integrationId,
        type,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!credential) return null;

    // Update last used
    await prisma.integrationCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {}); // Non-critical

    return decrypt(credential.value);
  }

  async getCredentials(integrationId: string): Promise<Array<Omit<IntegrationCredential, 'value'>>> {
    const credentials = await prisma.integrationCredential.findMany({
      where: { integrationId },
    });

    // Never expose value
    return credentials.map(c => ({ ...c, value: '[REDACTED]' })) as Array<Omit<IntegrationCredential, 'value'>>;
  }

  /* ============================================================
     SHARING POLICY
     ============================================================ */

  async createSharingPolicy(input: {
    integrationId: string;
    name: string;
    description?: string;
    scopes: SharingScope[];
    defaultScope: SharingScope;
    studentOptIn: boolean;
    autoApprove: boolean;
    retentionDays: number;
    actorId: string;
  }): Promise<SharingPolicy> {
    const integration = await this.getIntegration(input.integrationId);

    // Check if policy already exists
    const existing = await prisma.sharingPolicy.findUnique({
      where: { integrationId: input.integrationId },
    });

    if (existing) {
      throw new ConflictError('Sharing policy already exists for this integration');
    }

    const policy = await prisma.sharingPolicy.create({
      data: {
        integrationId: input.integrationId,
        name: input.name,
        description: input.description,
        scopes: input.scopes,
        defaultScope: input.defaultScope,
        studentOptIn: input.studentOptIn,
        autoApprove: input.autoApprove,
        retentionDays: input.retentionDays,
        createdBy: input.actorId,
      },
    });

    // Link to integration
    await prisma.integration.update({
      where: { id: input.integrationId },
      data: { sharingPolicyId: policy.id },
    });

    await this.recordAudit(input.integrationId, 'sharing_policy_created', input.actorId, 'USER', {
      policyId: policy.id,
      scopes: input.scopes,
    });

    logger.info({ integrationId: input.integrationId, policyId: policy.id }, 'Sharing policy created');
    return policy;
  }

  async updateSharingPolicy(id: string, input: {
    name?: string;
    description?: string;
    scopes?: SharingScope[];
    defaultScope?: SharingScope;
    studentOptIn?: boolean;
    autoApprove?: boolean;
    retentionDays?: number;
    actorId: string;
  }): Promise<SharingPolicy> {
    const policy = await prisma.sharingPolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new NotFoundError('Sharing policy');
    }

    const updated = await prisma.sharingPolicy.update({
      where: { id },
      data: {
        name: input.name ?? policy.name,
        description: input.description ?? policy.description,
        scopes: input.scopes ?? policy.scopes,
        defaultScope: input.defaultScope ?? policy.defaultScope,
        studentOptIn: input.studentOptIn ?? policy.studentOptIn,
        autoApprove: input.autoApprove ?? policy.autoApprove,
        retentionDays: input.retentionDays ?? policy.retentionDays,
      },
    });

    await this.recordAudit(policy.integrationId, 'sharing_policy_updated', input.actorId, 'USER', {
      policyId: id,
      scopes: input.scopes,
    });

    logger.info({ policyId: id }, 'Sharing policy updated');
    return updated;
  }

  async getSharingPolicy(integrationId: string): Promise<SharingPolicy | null> {
    return prisma.sharingPolicy.findUnique({ where: { integrationId } });
  }

  /* ============================================================
     ORGANIZATION MAPPING
     ============================================================ */

  async createOrganizationMapping(input: {
    integrationId: string;
    codeforgeCollegeId: string;
    externalOrgId: string;
    externalOrgName?: string;
    actorId: string;
  }): Promise<OrganizationMapping> {
    // Verify college belongs to integration's college
    const integration = await this.getIntegration(input.integrationId);
    if (integration.collegeId !== input.codeforgeCollegeId) {
      throw new AuthorizationError('College mismatch');
    }

    const mapping = await prisma.organizationMapping.create({
      data: {
        integrationId: input.integrationId,
        codeforgeCollegeId: input.codeforgeCollegeId,
        externalOrgId: input.externalOrgId,
        externalOrgName: input.externalOrgName,
        status: 'PENDING',
        mappedBy: input.actorId,
        mappedAt: new Date(),
      },
    });

    await this.recordAudit(input.integrationId, 'organization_mapped', input.actorId, 'USER', {
      mappingId: mapping.id,
      externalOrgId: input.externalOrgId,
    });

    logger.info({ integrationId: input.integrationId, mappingId: mapping.id }, 'Organization mapping created');
    return mapping;
  }

  async verifyOrganizationMapping(id: string, actorId: string): Promise<OrganizationMapping> {
    const mapping = await prisma.organizationMapping.findUnique({ where: { id } });
    if (!mapping) {
      throw new NotFoundError('Organization mapping');
    }

    const updated = await prisma.organizationMapping.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedBy: actorId,
      },
    });

    await this.recordAudit(mapping.integrationId, 'organization_verified', actorId, 'USER', {
      mappingId: id,
    });

    logger.info({ mappingId: id }, 'Organization mapping verified');
    return updated;
  }

  async getOrganizationMappings(integrationId: string): Promise<OrganizationMapping[]> {
    return prisma.organizationMapping.findMany({ where: { integrationId } });
  }

  /* ============================================================
     IDENTITY MAPPING
     ============================================================ */

  async createIdentityMapping(input: {
    integrationId: string;
    codeforgeStudentId: string;
    externalStudentId: string;
    externalEmail?: string;
    method: IdentityMappingMethod;
    actorId?: string;
  }): Promise<IdentityMapping> {
    // Verify student belongs to integration's college
    const integration = await this.getIntegration(input.integrationId);
    const student = await prisma.student.findUnique({
      where: { id: input.codeforgeStudentId },
    });

    if (!student) {
      throw new NotFoundError('Student');
    }

    if (student.collegeId !== integration.collegeId) {
      throw new AuthorizationError('Student does not belong to integration college');
    }

    // Check for conflicting mappings
    const conflict = await this.detectIdentityConflict(
      input.integrationId,
      input.codeforgeStudentId,
      input.externalStudentId,
    );

    const status: MappingStatus = conflict ? 'CONFLICT' : 'PENDING';

    const mapping = await prisma.identityMapping.create({
      data: {
        integrationId: input.integrationId,
        codeforgeStudentId: input.codeforgeStudentId,
        externalStudentId: input.externalStudentId,
        externalEmail: input.externalEmail,
        method: input.method,
        status,
        conflictId: conflict?.id,
        mappedBy: input.actorId,
        mappedAt: new Date(),
      },
    });

    if (conflict) {
      await this.recordAudit(input.integrationId, 'identity_conflict_detected', input.actorId || 'SYSTEM', 'SYSTEM', {
        mappingId: mapping.id,
        conflictId: conflict.id,
      });
      logger.warn({ mappingId: mapping.id, conflictId: conflict.id }, 'Identity conflict detected');
    } else {
      await this.recordAudit(input.integrationId, 'student_linked', input.actorId || 'SYSTEM', input.actorId ? 'USER' : 'SYSTEM', {
        mappingId: mapping.id,
        studentId: input.codeforgeStudentId,
        externalStudentId: input.externalStudentId,
      });
    }

    logger.info({ integrationId: input.integrationId, mappingId: mapping.id, status }, 'Identity mapping created');
    return mapping;
  }

  private async detectIdentityConflict(
    integrationId: string,
    codeforgeStudentId: string,
    externalStudentId: string
  ): Promise<IdentityMapping | null> {
    // Check if externalStudentId is already mapped to a different CodeForge student
    const existing = await prisma.identityMapping.findFirst({
      where: {
        integrationId,
        externalStudentId,
        codeforgeStudentId: { not: codeforgeStudentId },
        status: { in: ['PENDING', 'VERIFIED'] },
      },
    });

    return existing;
  }

  async verifyIdentityMapping(id: string, actorId: string): Promise<IdentityMapping> {
    const mapping = await prisma.identityMapping.findUnique({ where: { id } });
    if (!mapping) {
      throw new NotFoundError('Identity mapping');
    }

    if (mapping.status === 'CONFLICT') {
      throw new ValidationError('Cannot verify conflicting mapping');
    }

    const updated = await prisma.identityMapping.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedBy: actorId,
      },
    });

    await this.recordAudit(mapping.integrationId, 'identity_verified', actorId, 'USER', {
      mappingId: id,
      studentId: mapping.codeforgeStudentId,
    });

    logger.info({ mappingId: id }, 'Identity mapping verified');
    return updated;
  }

  async revokeIdentityMapping(id: string, actorId: string, reason?: string): Promise<IdentityMapping> {
    const mapping = await prisma.identityMapping.findUnique({ where: { id } });
    if (!mapping) {
      throw new NotFoundError('Identity mapping');
    }

    const updated = await prisma.identityMapping.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedBy: actorId,
        revokeReason: reason,
      },
    });

    await this.recordAudit(mapping.integrationId, 'student_unlinked', actorId, 'USER', {
      mappingId: id,
      studentId: mapping.codeforgeStudentId,
      reason,
    });

    logger.info({ mappingId: id }, 'Identity mapping revoked');
    return updated;
  }

  async getIdentityMappings(integrationId: string, filters?: {
    status?: MappingStatus;
    studentId?: string;
  }): Promise<IdentityMapping[]> {
    return prisma.identityMapping.findMany({
      where: {
        integrationId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.studentId ? { codeforgeStudentId: filters.studentId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getIdentityMappingByCodeforgeStudent(
    integrationId: string,
    codeforgeStudentId: string
  ): Promise<IdentityMapping | null> {
    return prisma.identityMapping.findFirst({
      where: {
        integrationId,
        codeforgeStudentId,
        status: { in: ['PENDING', 'VERIFIED'] },
      },
    });
  }

  /* ============================================================
     AUDIT
     ============================================================ */

  async recordAudit(
    integrationId: string,
    action: string,
    actorId: string,
    actorType: 'USER' | 'SYSTEM' | 'SCHEDULED_JOB' | 'WEBHOOK',
    metadata: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<IntegrationAudit> {
    return prisma.integrationAudit.create({
      data: {
        integrationId,
        action,
        actorId,
        actorType,
        metadata: metadata as any,
        ipAddress,
        userAgent,
      },
    });
  }

  async getAuditLog(integrationId: string, page = 1, limit = 50): Promise<{
    logs: IntegrationAudit[];
    total: number;
    totalPages: number;
  }> {
    const [logs, total] = await Promise.all([
      prisma.integrationAudit.findMany({
        where: { integrationId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.integrationAudit.count({ where: { integrationId } }),
    ]);

    return { logs, total, totalPages: Math.ceil(total / limit) };
  }
}

export const integrationService = new IntegrationService();