/**
 * Integration API Tests (Feature 37)
 * Tests for integration lifecycle, credentials, mappings, sharing policy, sync, events, reconciliation, audit, health, and webhooks
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from '../lib/prisma';
import { generateTokens, verifyAccessToken } from '../lib/auth';
import { Role } from '@prisma/client';

// Mock dependencies
vi.mock('../lib/prisma', () => ({
  prisma: {
    integration: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    integrationCredential: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    sharingPolicy: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    organizationMapping: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    identityMapping: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    syncJob: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    syncRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    integrationEvent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
    },
    integrationError: {
      create: vi.fn(),
    },
    integrationAudit: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    college: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../services/integration', () => ({
  integrationService: {
    createIntegration: vi.fn(),
    getIntegration: vi.fn(),
    getIntegrationByCollege: vi.fn(),
    updateIntegration: vi.fn(),
    connectIntegration: vi.fn(),
    disconnectIntegration: vi.fn(),
    createCredential: vi.fn(),
    rotateCredential: vi.fn(),
    revokeCredential: vi.fn(),
    getActiveCredential: vi.fn(),
    getCredentials: vi.fn(),
    createSharingPolicy: vi.fn(),
    updateSharingPolicy: vi.fn(),
    getSharingPolicy: vi.fn(),
    createOrganizationMapping: vi.fn(),
    verifyOrganizationMapping: vi.fn(),
    getOrganizationMappings: vi.fn(),
    createIdentityMapping: vi.fn(),
    verifyIdentityMapping: vi.fn(),
    revokeIdentityMapping: vi.fn(),
    getIdentityMappings: vi.fn(),
    getIdentityMappingByCodeforgeStudent: vi.fn(),
    recordAudit: vi.fn(),
    getAuditLog: vi.fn(),
  },
  syncEngine: {
    createSyncJob: vi.fn(),
    executeSyncJob: vi.fn(),
    getSyncJobStatus: vi.fn(),
    listSyncJobs: vi.fn(),
  },
  eventDelivery: {
    processPendingEvents: vi.fn(),
    retryDeadLetter: vi.fn(),
  },
  reconciliationService: {
    createReconciliationJob: vi.fn(),
    detectDivergence: vi.fn(),
    resolveDivergence: vi.fn(),
    getReconciliationStatus: vi.fn(),
  },
  buildTechnicalProfile: vi.fn(),
  filterProfileByScope: vi.fn(),
}));

vi.mock('../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../middleware/rateLimit', () => ({
  createRateLimiter: () => (req: any, res: any, next: any) => next(),
}));

// Import routes after mocks
import integrationRoutes from './integrations';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/integrations', integrationRoutes);
  return app;
}

describe('Integration Routes (Feature 37)', () => {
  let app: express.Express;
  const adminUserId = 'admin-123';
  const collegeId = 'college-123';
  const integrationId = 'integration-123';
  const syncJobId = 'sync-job-123';
  const eventId = 'evt-test-123';

  const adminToken = generateTokens({
    userId: adminUserId,
    email: 'admin@college.edu',
    role: 'COLLEGE_ADMIN' as Role,
    collegeId,
  }).accessToken;

  const superAdminToken = generateTokens({
    userId: 'super-123',
    email: 'super@prepvista.com',
    role: 'SUPER_ADMIN' as Role,
    collegeId: null,
  }).accessToken;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('POST /api/integrations - Create Integration', () => {
    it('should create integration for college admin', async () => {
      const { integrationService } = await import('../services/integration');
      (integrationService.createIntegration as any).mockResolvedValue({
        id: integrationId,
        collegeId,
        name: 'PrepVista Production',
        type: 'PREPVISTA',
        status: 'PENDING',
        config: { webhookUrl: 'https://prepvista.com/webhook' },
        createdAt: new Date(),
      });

      const response = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'PrepVista Production',
          type: 'PREPVISTA',
          config: { webhookUrl: 'https://prepvista.com/webhook' },
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.integration).toBeDefined();
      expect(response.body.integration.name).toBe('PrepVista Production');
      expect(integrationService.createIntegration).toHaveBeenCalledWith(
        expect.objectContaining({
          collegeId,
          name: 'PrepVista Production',
          type: 'PREPVISTA',
        })
      );
    });

    it('should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/integrations')
        .send({ name: 'Test', type: 'PREPVISTA', config: {} });

      expect(response.statusCode).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const studentToken = generateTokens({
        userId: 'student-123',
        email: 'student@college.edu',
        role: 'STUDENT' as Role,
        collegeId,
      }).accessToken;

      const response = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ name: 'Test', type: 'PREPVISTA', config: {} });

      expect(response.statusCode).toBe(403);
    });

    it('should validate required config fields', async () => {
      const response = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test', type: 'PREPVISTA', config: {} });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/integrations - List Integrations', () => {
    it('should list integrations for college admin', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([
        {
          id: integrationId,
          name: 'PrepVista Production',
          type: 'PREPVISTA',
          status: 'ACTIVE',
          collegeId,
          sharingPolicy: { id: 'policy-1', defaultScope: 'STANDARD' },
          _count: { credentials: 2, mappings: 1, identityMappings: 50, syncJobs: 3 },
          connectedAt: new Date(),
          lastSyncAt: new Date(),
          errorCount: 0,
        },
      ]);

      const response = await request(app)
        .get('/api/integrations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.integrations).toHaveLength(1);
      expect(response.body.integrations[0].name).toBe('PrepVista Production');
    });

    it('should list all integrations for super admin', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/integrations')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.statusCode).toBe(200);
      // Should not filter by collegeId for super admin
    });
  });

  describe('GET /api/integrations/:id - Get Integration Details', () => {
    it('should return integration with full details', async () => {
      (prisma.integration.findUnique as any).mockResolvedValue({
        id: integrationId,
        name: 'PrepVista Production',
        type: 'PREPVISTA',
        status: 'ACTIVE',
        collegeId,
        externalId: 'pv-org-123',
        config: { webhookUrl: 'https://prepvista.com/webhook' },
        sharingPolicy: { id: 'policy-1', defaultScope: 'STANDARD', scopes: ['MINIMAL', 'STANDARD'] },
        credentials: [
          { id: 'cred-1', name: 'api_key', type: 'API_KEY', status: 'ACTIVE', expiresAt: null, createdAt: new Date(), lastUsedAt: new Date() },
          { id: 'cred-2', name: 'webhook_secret', type: 'WEBHOOK_SECRET', status: 'ACTIVE', expiresAt: null, createdAt: new Date(), lastUsedAt: null },
        ],
        mappings: [{ id: 'map-1', codeforgeCollegeId: collegeId, externalOrgId: 'pv-org-123', status: 'VERIFIED' }],
        identityMappings: Array(50).fill({ id: 'im-1', codeforgeStudentId: 's-1', externalStudentId: 'pv-s-1', status: 'VERIFIED' }),
        syncJobs: [
          { id: syncJobId, type: 'INITIAL', status: 'COMPLETED', createdAt: new Date() },
        ],
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        lastError: null,
        errorCount: 0,
      });

      const response = await request(app)
        .get(`/api/integrations/${integrationId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.integration).toBeDefined();
      expect(response.body.integration.credentials).toHaveLength(2);
      expect(response.body.integration.credentials[0].value).toBeUndefined(); // Value should not be returned
    });

    it('should return 404 for non-existent integration', async () => {
      (prisma.integration.findUnique as any).mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/integrations/non-existent`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(404);
    });

    it('should enforce college access control', async () => {
      (prisma.integration.findUnique as any).mockResolvedValue({
        id: integrationId,
        collegeId: 'other-college',
        name: 'Other Integration',
        type: 'PREPVISTA',
        status: 'ACTIVE',
      });

      const response = await request(app)
        .get(`/api/integrations/${integrationId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PUT /api/integrations/:id - Update Integration', () => {
    it('should update integration', async () => {
      const { integrationService } = await import('../services/integration');
      (integrationService.updateIntegration as any).mockResolvedValue({
        id: integrationId,
        name: 'Updated Name',
        externalId: 'new-external-id',
        status: 'ACTIVE',
      });

      const response = await request(app)
        .put(`/api/integrations/${integrationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Name', externalId: 'new-external-id' });

      expect(response.statusCode).toBe(200);
      expect(response.body.integration.name).toBe('Updated Name');
    });
  });

  describe('POST /api/integrations/:id/connect - Connect Integration', () => {
    it('should connect integration', async () => {
      const { integrationService } = await import('../services/integration');
      (integrationService.connectIntegration as any).mockResolvedValue({
        id: integrationId,
        status: 'ACTIVE',
        connectedAt: new Date(),
      });

      const response = await request(app)
        .post(`/api/integrations/${integrationId}/connect`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.integration.status).toBe('ACTIVE');
    });

    it('should reject connecting already active integration', async () => {
      const { integrationService } = await import('../services/integration');
      (integrationService.connectIntegration as any).mockRejectedValue(new Error('Integration already active'));

      const response = await request(app)
        .post(`/api/integrations/${integrationId}/connect`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/integrations/:id/disconnect - Disconnect Integration', () => {
    it('should disconnect integration and revoke credentials', async () => {
      const { integrationService } = await import('../services/integration');
      (integrationService.disconnectIntegration as any).mockResolvedValue({
        id: integrationId,
        status: 'DISCONNECTED',
        disconnectedAt: new Date(),
      });

      const response = await request(app)
        .post(`/api/integrations/${integrationId}/disconnect`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.integration.status).toBe('DISCONNECTED');
    });
  });

  describe('Credentials Management', () => {
    const credentialId = 'cred-123';

    describe('POST /api/integrations/:id/credentials - Create Credential', () => {
      it('should create encrypted credential', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.createCredential as any).mockResolvedValue({
          id: credentialId,
          integrationId,
          name: 'api_key',
          type: 'API_KEY',
          value: 'encrypted-value',
          status: 'ACTIVE',
          createdAt: new Date(),
        });

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/credentials`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'api_key', type: 'API_KEY', value: 'sk-test-key-123' });

        expect(response.statusCode).toBe(201);
        expect(response.body.credential).toBeDefined();
        expect(response.body.credential.value).toBeUndefined(); // Value should be stripped
        expect(response.body.credential.type).toBe('API_KEY');
      });

      it('should validate credential type', async () => {
        const response = await request(app)
          .post(`/api/integrations/${integrationId}/credentials`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'test', type: 'INVALID_TYPE', value: 'secret' });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('POST /api/integrations/:id/credentials/:credId/rotate - Rotate Credential', () => {
      it('should rotate credential', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.rotateCredential as any).mockResolvedValue({
          id: credentialId,
          status: 'ACTIVE',
          rotatedAt: new Date(),
        });

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/credentials/${credentialId}/rotate`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ value: 'new-secret-value' });

        expect(response.statusCode).toBe(200);
        expect(response.body.credential.status).toBe('ACTIVE');
      });
    });

    describe('POST /api/integrations/:id/credentials/:credId/revoke - Revoke Credential', () => {
      it('should revoke credential', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.revokeCredential as any).mockResolvedValue({
          id: credentialId,
          status: 'REVOKED',
        });

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/credentials/${credentialId}/revoke`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.credential.status).toBe('REVOKED');
      });
    });
  });

  describe('Sharing Policy', () => {
    describe('POST /api/integrations/:id/sharing-policy - Create Sharing Policy', () => {
      it('should create sharing policy with scopes', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.createSharingPolicy as any).mockResolvedValue({
          id: 'policy-123',
          integrationId,
          name: 'Standard Policy',
          scopes: ['MINIMAL', 'STANDARD'],
          defaultScope: 'STANDARD',
          studentOptIn: false,
          autoApprove: true,
          retentionDays: 365,
          createdBy: adminUserId,
        });

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/sharing-policy`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Standard Policy',
            scopes: ['MINIMAL', 'STANDARD'],
            defaultScope: 'STANDARD',
            studentOptIn: false,
            autoApprove: true,
            retentionDays: 365,
          });

        expect(response.statusCode).toBe(201);
        expect(response.body.policy.scopes).toEqual(['MINIMAL', 'STANDARD']);
        expect(response.body.policy.defaultScope).toBe('STANDARD');
      });

      it('should reject duplicate policy', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.createSharingPolicy as any).mockRejectedValue(new Error('Sharing policy already exists'));

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/sharing-policy`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Test', scopes: ['MINIMAL'], defaultScope: 'MINIMAL' });

        expect(response.statusCode).toBe(409);
      });
    });

    describe('PUT /api/integrations/:id/sharing-policy - Update Sharing Policy', () => {
      it('should update sharing policy', async () => {
        (prisma.sharingPolicy.findUnique as any).mockResolvedValue({ id: 'policy-123', integrationId });
        const { integrationService } = await import('../services/integration');
        (integrationService.updateSharingPolicy as any).mockResolvedValue({
          id: 'policy-123',
          defaultScope: 'DETAILED',
          studentOptIn: true,
        });

        const response = await request(app)
          .put(`/api/integrations/${integrationId}/sharing-policy`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ defaultScope: 'DETAILED', studentOptIn: true });

        expect(response.statusCode).toBe(200);
        expect(response.body.policy.defaultScope).toBe('DETAILED');
      });
    });
  });

  describe('Organization Mapping', () => {
    describe('POST /api/integrations/:id/organization-mapping - Create Mapping', () => {
      it('should create organization mapping', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.createOrganizationMapping as any).mockResolvedValue({
          id: 'map-123',
          integrationId,
          codeforgeCollegeId: collegeId,
          externalOrgId: 'pv-org-456',
          externalOrgName: 'PrepVista Demo Org',
          status: 'PENDING',
          mappedBy: adminUserId,
        });

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/organization-mapping`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ codeforgeCollegeId: collegeId, externalOrgId: 'pv-org-456', externalOrgName: 'PrepVista Demo Org' });

        expect(response.statusCode).toBe(201);
        expect(response.body.mapping.externalOrgId).toBe('pv-org-456');
      });

      it('should reject college mismatch', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.createOrganizationMapping as any).mockRejectedValue(new Error('College mismatch'));

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/organization-mapping`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ codeforgeCollegeId: 'other-college', externalOrgId: 'pv-org-456' });

        expect(response.statusCode).toBe(403);
      });
    });

    describe('POST /api/integrations/:id/organization-mapping/:mappingId/verify - Verify Mapping', () => {
      it('should verify organization mapping', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.verifyOrganizationMapping as any).mockResolvedValue({
          id: 'map-123',
          status: 'VERIFIED',
          verifiedAt: new Date(),
        });

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/organization-mapping/map-123/verify`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.mapping.status).toBe('VERIFIED');
      });
    });
  });

  describe('Identity Mapping', () => {
    const studentId = 'student-456';

    describe('POST /api/integrations/:id/identity-mapping - Create Identity Mapping', () => {
      it('should create identity mapping', async () => {
        (prisma.student.findUnique as any).mockResolvedValue({ id: studentId, collegeId });
        const { integrationService } = await import('../services/integration');
        (integrationService.createIdentityMapping as any).mockResolvedValue({
          id: 'im-123',
          integrationId,
          codeforgeStudentId: studentId,
          externalStudentId: 'pv-student-789',
          method: 'ADMIN_MANUAL',
          status: 'PENDING',
        });

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/identity-mapping`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            codeforgeStudentId: studentId,
            externalStudentId: 'pv-student-789',
            method: 'ADMIN_MANUAL',
          });

        expect(response.statusCode).toBe(201);
        expect(response.body.mapping.externalStudentId).toBe('pv-student-789');
      });

      it('should detect identity conflict', async () => {
        (prisma.student.findUnique as any).mockResolvedValue({ id: studentId, collegeId });
        const { integrationService } = await import('../services/integration');
        (integrationService.createIdentityMapping as any).mockResolvedValue({
          id: 'im-123',
          status: 'CONFLICT',
          conflictId: 'existing-im-123',
        });

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/identity-mapping`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            codeforgeStudentId: studentId,
            externalStudentId: 'pv-student-789',
            method: 'ADMIN_MANUAL',
          });

        expect(response.statusCode).toBe(201);
        expect(response.body.mapping.status).toBe('CONFLICT');
      });
    });

    describe('POST /api/integrations/:id/identity-mapping/:mappingId/verify - Verify Identity Mapping', () => {
      it('should verify identity mapping', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.verifyIdentityMapping as any).mockResolvedValue({
          id: 'im-123',
          status: 'VERIFIED',
          verifiedAt: new Date(),
        });

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/identity-mapping/im-123/verify`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.mapping.status).toBe('VERIFIED');
      });

      it('should reject verifying conflicting mapping', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.verifyIdentityMapping as any).mockRejectedValue(new Error('Cannot verify conflicting mapping'));

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/identity-mapping/im-123/verify`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(400);
      });
    });

    describe('POST /api/integrations/:id/identity-mapping/:mappingId/revoke - Revoke Identity Mapping', () => {
      it('should revoke identity mapping with reason', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.revokeIdentityMapping as any).mockResolvedValue({
          id: 'im-123',
          status: 'REVOKED',
          revokedAt: new Date(),
          revokeReason: 'Student graduated',
        });

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/identity-mapping/im-123/revoke`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ reason: 'Student graduated' });

        expect(response.statusCode).toBe(200);
        expect(response.body.mapping.status).toBe('REVOKED');
        expect(response.body.mapping.revokeReason).toBe('Student graduated');
      });
    });

    describe('GET /api/integrations/:id/identity-mappings - List Identity Mappings', () => {
      it('should list identity mappings with filters', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.getIdentityMappings as any).mockResolvedValue([
          { id: 'im-1', codeforgeStudentId: studentId, externalStudentId: 'pv-s-1', status: 'VERIFIED' },
          { id: 'im-2', codeforgeStudentId: 'student-2', externalStudentId: 'pv-s-2', status: 'PENDING' },
        ]);

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/identity-mappings?status=VERIFIED`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.mappings).toHaveLength(2);
      });
    });
  });

  describe('Sync Jobs', () => {
    describe('POST /api/integrations/:id/sync - Trigger Sync Job', () => {
      it('should create and execute initial sync job', async () => {
        const { syncEngine } = await import('../services/integration');
        (syncEngine.createSyncJob as any).mockResolvedValue(syncJobId);

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/sync`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ type: 'INITIAL', scope: 'ALL_ELIGIBLE', idempotencyKey: 'initial-sync-1' });

        expect(response.statusCode).toBe(202);
        expect(response.body.syncJobId).toBe(syncJobId);
        expect(response.body.status).toBe('pending');
      });

      it('should create incremental sync job', async () => {
        const { syncEngine } = await import('../services/integration');
        (syncEngine.createSyncJob as any).mockResolvedValue(syncJobId);

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/sync`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ type: 'INCREMENTAL', scope: 'CHANGED_ONLY' });

        expect(response.statusCode).toBe(202);
      });

      it('should create single student sync job', async () => {
        const { syncEngine } = await import('../services/integration');
        (syncEngine.createSyncJob as any).mockResolvedValue(syncJobId);

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/sync`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ type: 'SINGLE_STUDENT', scope: 'SPECIFIC_STUDENTS', studentIds: ['student-456'] });

        expect(response.statusCode).toBe(202);
      });
    });

    describe('GET /api/integrations/:id/sync/:jobId - Get Sync Job Status', () => {
      it('should return sync job with records', async () => {
        const { syncEngine } = await import('../services/integration');
        (syncEngine.getSyncJobStatus as any).mockResolvedValue({
          id: syncJobId,
          integrationId,
          type: 'INITIAL',
          status: 'COMPLETED',
          scope: 'ALL_ELIGIBLE',
          studentIds: ['student-456'],
          totalRecords: 1,
          processedRecords: 1,
          failedRecords: 0,
          records: [
            { id: 'sr-1', studentId: 'student-456', status: 'COMPLETED', resourceType: 'TechnicalProfile' },
          ],
        });

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/sync/${syncJobId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.syncJob.status).toBe('COMPLETED');
        expect(response.body.syncJob.records).toHaveLength(1);
      });
    });

    describe('GET /api/integrations/:id/sync - List Sync Jobs', () => {
      it('should list sync jobs with pagination', async () => {
        const { syncEngine } = await import('../services/integration');
        (syncEngine.listSyncJobs as any).mockResolvedValue({
          jobs: [
            { id: syncJobId, type: 'INITIAL', status: 'COMPLETED', createdAt: new Date() },
          ],
          total: 1,
          totalPages: 1,
        });

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/sync?page=1&limit=20`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.jobs).toHaveLength(1);
      });
    });
  });

  describe('Events', () => {
    describe('GET /api/integrations/:id/events - List Events', () => {
      it('should list events with pagination', async () => {
        (prisma.integrationEvent.findMany as any).mockResolvedValue([
          { id: 'evt-1', eventId, eventType: 'technical.profile.updated', status: 'DELIVERED', createdAt: new Date() },
        ]);
        (prisma.integrationEvent.count as any).mockResolvedValue(1);

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/events?page=1&limit=50`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.events).toHaveLength(1);
        expect(response.body.pagination.total).toBe(1);
      });
    });

    describe('POST /api/integrations/:id/events/:eventId/retry - Retry Dead Letter', () => {
      it('should retry dead-lettered event', async () => {
        const { eventDelivery } = await import('../services/integration');
        (eventDelivery.retryDeadLetter as any).mockResolvedValue(undefined);

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/events/${eventId}/retry`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Event retry scheduled');
      });
    });
  });

  describe('Reconciliation', () => {
    describe('POST /api/integrations/:id/reconcile - Trigger Reconciliation', () => {
      it('should create reconciliation job', async () => {
        const { reconciliationService } = await import('../services/integration');
        (reconciliationService.createReconciliationJob as any).mockResolvedValue(syncJobId);

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/reconcile`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(202);
        expect(response.body.jobId).toBe(syncJobId);
      });
    });

    describe('GET /api/integrations/:id/reconciliation/status - Get Reconciliation Status', () => {
      it('should return reconciliation status', async () => {
        const { reconciliationService } = await import('../services/integration');
        (reconciliationService.getReconciliationStatus as any).mockResolvedValue({
          totalStudents: 100,
          syncedStudents: 95,
          divergentStudents: 3,
          neverSyncedStudents: 2,
          lastReconciliationAt: new Date(),
          lastReconciliationResult: 'DIVERGENCE_DETECTED',
        });

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/reconciliation/status`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.reconciliation.totalStudents).toBe(100);
        expect(response.body.reconciliation.divergentStudents).toBe(3);
        expect(response.body.reconciliation.lastReconciliationResult).toBe('DIVERGENCE_DETECTED');
      });
    });
  });

  describe('Audit', () => {
    describe('GET /api/integrations/:id/audit - Get Audit Log', () => {
      it('should return audit log with pagination', async () => {
        const { integrationService } = await import('../services/integration');
        (integrationService.getAuditLog as any).mockResolvedValue({
          logs: [
            { id: 'audit-1', action: 'connected', actorId: adminUserId, actorType: 'USER', createdAt: new Date() },
            { id: 'audit-2', action: 'credential_created', actorId: adminUserId, actorType: 'USER', createdAt: new Date() },
          ],
          total: 2,
          totalPages: 1,
        });

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/audit?page=1&limit=50`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.logs).toHaveLength(2);
        expect(response.body.total).toBe(2);
      });
    });
  });

  describe('Health', () => {
    describe('GET /api/integrations/:id/health - Get Integration Health', () => {
      it('should return healthy integration status', async () => {
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          status: 'ACTIVE',
          lastSyncAt: new Date(),
          lastError: null,
          errorCount: 0,
          credentials: [{ status: 'ACTIVE', expiresAt: null }],
          identityMappings: [{ status: 'VERIFIED' }],
          mappings: [{ status: 'VERIFIED' }],
        });
        (prisma.integrationEvent.count as any)
          .mockResolvedValueOnce(0) // pending
          .mockResolvedValueOnce(0) // failed
          .mockResolvedValueOnce(0); // dead letter

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/health`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.health.connection).toBe('HEALTHY');
        expect(response.body.health.identityMapping).toBe('HEALTHY');
        expect(response.body.health.synchronization).toBe('HEALTHY');
        expect(response.body.health.eventDelivery).toBe('HEALTHY');
        expect(response.body.health.pendingEvents).toBe(0);
        expect(response.body.health.credentialStatus).toBe('VALID');
      });

      it('should return degraded status for failed events', async () => {
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          status: 'ACTIVE',
          lastSyncAt: new Date(),
          lastError: null,
          errorCount: 0,
          credentials: [{ status: 'ACTIVE', expiresAt: null }],
          identityMappings: [{ status: 'VERIFIED' }],
          mappings: [{ status: 'VERIFIED' }],
        });
        (prisma.integrationEvent.count as any)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(5) // failed
          .mockResolvedValueOnce(0);

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/health`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.health.eventDelivery).toBe('DEGRADED');
        expect(response.body.health.failedEvents).toBe(5);
      });

      it('should show credential expiring status', async () => {
        const expiryDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          status: 'ACTIVE',
          lastSyncAt: new Date(),
          lastError: null,
          errorCount: 0,
          credentials: [{ status: 'ACTIVE', expiresAt: expiryDate }],
          identityMappings: [{ status: 'VERIFIED' }],
          mappings: [{ status: 'VERIFIED' }],
        });
        (prisma.integrationEvent.count as any)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0);

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/health`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.body.health.credentialStatus).toBe('EXPIRING');
      });
    });
  });

  describe('Webhook Delivery (PrepVista → CodeForge)', () => {
    describe('POST /api/integrations/:id/webhook', () => {
      it('should validate webhook signature', async () => {
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          config: { webhookUrl: 'https://prepvista.com/webhook' },
        });

        const { integrationService } = await import('../services/integration');
        (integrationService.getActiveCredential as any).mockResolvedValue('webhook-secret-123');

        const payload = { eventType: 'sync.completed', organizationRef: 'pv-org-123', payload: { studentCount: 50 } };
        const timestamp = Date.now();
        const crypto = await import('crypto');
        const signature = crypto.createHmac('sha256', 'webhook-secret-123')
          .update(JSON.stringify(payload))
          .digest('hex');

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/webhook`)
          .set('X-Signature', `sha256=${signature}`)
          .set('X-Timestamp', String(timestamp))
          .set('X-Event-ID', 'evt-webhook-123')
          .send(payload);

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe('received');
      });

      it('should reject invalid signature', async () => {
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          config: { webhookUrl: 'https://prepvista.com/webhook' },
        });

        const { integrationService } = await import('../services/integration');
        (integrationService.getActiveCredential as any).mockResolvedValue('webhook-secret-123');

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/webhook`)
          .set('X-Signature', 'sha256=invalid-signature')
          .set('X-Timestamp', String(Date.now()))
          .set('X-Event-ID', 'evt-webhook-123')
          .send({ eventType: 'test' });

        expect(response.statusCode).toBe(400);
      });

      it('should reject stale timestamp', async () => {
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          config: { webhookUrl: 'https://prepvista.com/webhook' },
        });

        const { integrationService } = await import('../services/integration');
        (integrationService.getActiveCredential as any).mockResolvedValue('webhook-secret-123');

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/webhook`)
          .set('X-Signature', 'sha256=valid')
          .set('X-Timestamp', String(Date.now() - 10 * 60 * 1000)) // 10 minutes ago
          .set('X-Event-ID', 'evt-webhook-123')
          .send({ eventType: 'test' });

        expect(response.statusCode).toBe(400);
      });

      it('should handle replay protection', async () => {
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          config: { webhookUrl: 'https://prepvista.com/webhook' },
        });
        (prisma.integrationEvent.findUnique as any).mockResolvedValue({ eventId: 'evt-webhook-123' }); // Already exists

        const { integrationService } = await import('../services/integration');
        (integrationService.getActiveCredential as any).mockResolvedValue('webhook-secret-123');

        const payload = { eventType: 'test' };
        const timestamp = Date.now();
        const crypto = await import('crypto');
        const signature = crypto.createHmac('sha256', 'webhook-secret-123')
          .update(JSON.stringify(payload))
          .digest('hex');

        const response = await request(app)
          .post(`/api/integrations/${integrationId}/webhook`)
          .set('X-Signature', `sha256=${signature}`)
          .set('X-Timestamp', String(timestamp))
          .set('X-Event-ID', 'evt-webhook-123')
          .send(payload);

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe('duplicate');
      });
    });
  });

  describe('PrepVista Consumption API', () => {
    describe('GET /api/integrations/:id/profile/:studentId - Get Technical Profile', () => {
      it('should return filtered technical profile for verified student', async () => {
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          status: 'ACTIVE',
          collegeId,
          sharingPolicy: { defaultScope: 'STANDARD' },
          college: { id: collegeId },
        });
        (prisma.student.findUnique as any).mockResolvedValue({ id: 'student-456', collegeId });

        const { integrationService } = await import('../services/integration');
        (integrationService.getIdentityMappingByCodeforgeStudent as any).mockResolvedValue({
          id: 'im-123',
          codeforgeStudentId: 'student-456',
          externalStudentId: 'pv-student-789',
          status: 'VERIFIED',
        });

        const { buildTechnicalProfile, filterProfileByScope } = await import('../services/integration');
        (buildTechnicalProfile as any).mockResolvedValue({
          version: 'v1',
          studentId: 'student-456',
          externalStudentId: 'pv-student-789',
          organizationId: collegeId,
          roles: ['Software Engineer'],
          skills: [{ skillId: 'skill-1', name: 'JavaScript', category: 'Languages', proficiency: 80, confidence: 'HIGH', evidenceCount: 5, lastUpdated: new Date().toISOString() }],
          mastery: [{ skillId: 'skill-1', skillName: 'JavaScript', level: 'ADVANCED', confidence: 'HIGH', evidenceSummary: '5 evidence points', trend: 'IMPROVING' }],
          gaps: [],
          readiness: [{ role: 'Software Engineer', overallReadiness: 75, dimensionScores: [], topGaps: [], confidence: 'HIGH', lastCalculated: new Date().toISOString() }],
          growth: [],
          evidenceSummary: { assessmentCount: 5, interviewCount: 0, projectCount: 0, totalEvidencePoints: 10, highConfidenceEvidence: 8, skillCoverage: 80, lastEvidenceDate: new Date().toISOString() },
          assessmentSummary: { totalAssessments: 5, completedAssessments: 5, averageScore: 78, byType: {}, recentTrend: 'IMPROVING', lastAssessmentDate: new Date().toISOString() },
          metadata: { generatedAt: new Date().toISOString(), dataVersion: '1.0', contractVersion: 'v1', sharingScope: 'STANDARD' },
        });
        (filterProfileByScope as any).mockImplementation((profile) => profile);

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/profile/student-456`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.profile).toBeDefined();
        expect(response.body.profile.externalStudentId).toBe('pv-student-789');
        expect(response.body.profile.skills).toHaveLength(1);
      });

      it('should reject if integration not active', async () => {
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          status: 'PENDING',
          collegeId,
          sharingPolicy: { defaultScope: 'STANDARD' },
        });

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/profile/student-456`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(400);
      });

      it('should reject if student not linked', async () => {
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          status: 'ACTIVE',
          collegeId,
          sharingPolicy: { defaultScope: 'STANDARD' },
          college: { id: collegeId },
        });
        (prisma.student.findUnique as any).mockResolvedValue({ id: 'student-456', collegeId });

        const { integrationService } = await import('../services/integration');
        (integrationService.getIdentityMappingByCodeforgeStudent as any).mockResolvedValue(null);

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/profile/student-456`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });

      it('should reject cross-college access', async () => {
        (prisma.integration.findUnique as any).mockResolvedValue({
          id: integrationId,
          status: 'ACTIVE',
          collegeId: 'other-college',
          sharingPolicy: { defaultScope: 'STANDARD' },
        });
        (prisma.student.findUnique as any).mockResolvedValue({ id: 'student-456', collegeId });

        const response = await request(app)
          .get(`/api/integrations/${integrationId}/profile/student-456`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(403);
      });
    });
  });
});