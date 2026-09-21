/**
 * Integration Routes (Feature 37)
 * PrepVista Integration API endpoints
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { createIntegrationSchema, updateIntegrationSchema, sharingPolicySchema, organizationMappingSchema, identityMappingSchema, syncJobSchema, credentialSchema, idParamSchema } from '@prepvista/shared';
import { NotFoundError, ValidationError, AuthorizationError, ConflictError, RateLimitError } from '../middleware/error';
import { logger } from '../lib/logger';
import { integrationService, syncEngine, eventDelivery, reconciliationService } from '../services/integration';
import { buildTechnicalProfile, filterProfileByScope } from '../services/integration';
import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();

const integrationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 integration requests per minute per user
  message: 'Integration API rate limit exceeded',
  keyPrefix: 'integration',
});

const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 webhook deliveries per minute
  message: 'Webhook rate limit exceeded',
  keyPrefix: 'webhook',
});

/**
 * Helper: verifies integration access for college admin / super admin
 */
async function verifyIntegrationAccess(req: any, integrationId: string): Promise<void> {
  const integration = await integrationService.getIntegration(integrationId);

  if (req.auth!.role === 'SUPER_ADMIN') return;

  if (req.auth!.role === 'COLLEGE_ADMIN' && req.auth!.collegeId === integration.collegeId) return;

  throw new AuthorizationError('Access denied: insufficient role or college mismatch');
}

/* ============================================================
   INTEGRATION LIFECYCLE
   ============================================================ */

/**
 * POST /api/integrations
 * Create a new integration
 */
router.post('/',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  integrationRateLimiter,
  validateBody(createIntegrationSchema),
  async (req, res, next) => {
    try {
      const { name, type, externalId, config } = req.body;

      // For college admins, force collegeId to their own
      let collegeId = req.auth!.collegeId;
      if (req.auth!.role === 'SUPER_ADMIN' && req.body.collegeId) {
        collegeId = req.body.collegeId;
      }
      if (!collegeId) {
        throw new ValidationError('College ID required');
      }

      const integration = await integrationService.createIntegration({
        collegeId,
        name,
        type,
        externalId,
        config,
        actorId: req.auth!.userId,
      });

      res.status(201).json({ integration });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/integrations
 * List integrations for the current college (or all for super admin)
 */
router.get('/',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const where: any = {};
      if (req.auth!.role !== 'SUPER_ADMIN') {
        where.collegeId = req.auth!.collegeId;
      }

      const integrations = await prisma.integration.findMany({
        where,
        include: {
          sharingPolicy: true,
          _count: {
            select: {
              credentials: true,
              mappings: true,
              identityMappings: true,
              syncJobs: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ integrations });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/integrations/:id
 * Get integration details
 */
router.get('/:id',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const integration = await prisma.integration.findUnique({
        where: { id: req.params.id },
        include: {
          sharingPolicy: true,
          credentials: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              expiresAt: true,
              createdAt: true,
              updatedAt: true,
              lastUsedAt: true,
              rotatedAt: true,
            },
          },
          mappings: true,
          identityMappings: true,
          syncJobs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!integration) {
        throw new NotFoundError('Integration');
      }

      res.json({ integration });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/integrations/:id
 * Update integration
 */
router.put('/:id',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  validateBody(updateIntegrationSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const integration = await integrationService.updateIntegration(req.params.id, {
        ...req.body,
        actorId: req.auth!.userId,
      });

      res.json({ integration });
    } catch (error) {
      next(error);
    }
  }
);

router.patch('/:id',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  validateBody(updateIntegrationSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const integration = await integrationService.updateIntegration(req.params.id, {
        ...req.body,
        actorId: req.auth!.userId,
      });
      res.json({ integration });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/integrations/:id/connect
 * Connect integration
 */
router.post('/:id/connect',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const integration = await integrationService.connectIntegration(req.params.id, req.auth!.userId);
      res.json({ integration });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/integrations/:id/disconnect
 * Disconnect integration
 */
router.post('/:id/disconnect',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const integration = await integrationService.disconnectIntegration(req.params.id, req.auth!.userId);
      res.json({ integration });
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   CREDENTIALS
   ============================================================ */

/**
 * POST /api/integrations/:id/credentials
 * Create credential
 */
router.post('/:id/credentials',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  validateBody(credentialSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const credential = await integrationService.createCredential({
        integrationId: req.params.id,
        name: req.body.name,
        type: req.body.type,
        value: req.body.value,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        actorId: req.auth!.userId,
      });

      // Never return value
      const { value, ...safeCredential } = credential;
      res.status(201).json({ credential: safeCredential });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/integrations/:id/credentials/:credId/rotate
 * Rotate credential
 */
router.post('/:id/credentials/:credId/rotate',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema.extend({ credId: z.string().uuid() })),
  validateBody(z.object({ value: z.string().min(1) })),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const credential = await integrationService.rotateCredential(req.params.credId, req.body.value, req.auth!.userId);
      const { value, ...safeCredential } = credential;
      res.json({ credential: safeCredential });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/integrations/:id/credentials/:credId/revoke
 * Revoke credential
 */
router.post('/:id/credentials/:credId/revoke',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema.extend({ credId: z.string().uuid() })),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const credential = await integrationService.revokeCredential(req.params.credId, req.auth!.userId);
      const { value, ...safeCredential } = credential;
      res.json({ credential: safeCredential });
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   SHARING POLICY
   ============================================================ */

/**
 * POST /api/integrations/:id/sharing-policy
 * Create sharing policy
 */
router.post('/:id/sharing-policy',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  validateBody(sharingPolicySchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const policy = await integrationService.createSharingPolicy({
        integrationId: req.params.id,
        name: req.body.name,
        description: req.body.description,
        scopes: req.body.scopes,
        defaultScope: req.body.defaultScope,
        studentOptIn: req.body.studentOptIn,
        autoApprove: req.body.autoApprove,
        retentionDays: req.body.retentionDays,
        actorId: req.auth!.userId,
      });

      res.status(201).json({ policy });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/integrations/:id/sharing-policy
 * Update sharing policy
 */
router.put('/:id/sharing-policy',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  validateBody(sharingPolicySchema.partial()),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const policy = await prisma.sharingPolicy.findUnique({
        where: { integrationId: req.params.id },
      });

      if (!policy) {
        throw new NotFoundError('Sharing policy');
      }

      const updated = await integrationService.updateSharingPolicy(policy.id, {
        ...req.body,
        actorId: req.auth!.userId,
      });

      res.json({ policy: updated });
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   ORGANIZATION MAPPING
   ============================================================ */

/**
 * POST /api/integrations/:id/organization-mapping
 * Create organization mapping
 */
router.post('/:id/organization-mapping',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  validateBody(organizationMappingSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const mapping = await integrationService.createOrganizationMapping({
        integrationId: req.params.id,
        codeforgeCollegeId: req.body.codeforgeCollegeId,
        externalOrgId: req.body.externalOrgId,
        externalOrgName: req.body.externalOrgName,
        actorId: req.auth!.userId,
      });

      res.status(201).json({ mapping });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/integrations/:id/organization-mapping/:mappingId/verify
 * Verify organization mapping
 */
router.post('/:id/organization-mapping/:mappingId/verify',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema.extend({ mappingId: z.string().uuid() })),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const mapping = await integrationService.verifyOrganizationMapping(req.params.mappingId, req.auth!.userId);
      res.json({ mapping });
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   IDENTITY MAPPING
   ============================================================ */

/**
 * POST /api/integrations/:id/identity-mapping
 * Create identity mapping
 */
router.post('/:id/identity-mapping',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  validateBody(identityMappingSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const mapping = await integrationService.createIdentityMapping({
        integrationId: req.params.id,
        codeforgeStudentId: req.body.codeforgeStudentId,
        externalStudentId: req.body.externalStudentId,
        externalEmail: req.body.externalEmail,
        method: req.body.method,
        actorId: req.auth!.userId,
      });

      res.status(201).json({ mapping });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/integrations/:id/identity-mapping/:mappingId/verify
 * Verify identity mapping
 */
router.post('/:id/identity-mapping/:mappingId/verify',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema.extend({ mappingId: z.string().uuid() })),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const mapping = await integrationService.verifyIdentityMapping(req.params.mappingId, req.auth!.userId);
      res.json({ mapping });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/integrations/:id/identity-mapping/:mappingId/revoke
 * Revoke identity mapping
 */
router.post('/:id/identity-mapping/:mappingId/revoke',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema.extend({ mappingId: z.string().uuid() })),
  validateBody(z.object({ reason: z.string().optional() })),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const mapping = await integrationService.revokeIdentityMapping(req.params.mappingId, req.auth!.userId, req.body.reason);
      res.json({ mapping });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/integrations/:id/identity-mappings
 * List identity mappings
 */
router.get('/:id/identity-mappings',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const { status, studentId } = req.query;
      const mappings = await integrationService.getIdentityMappings(req.params.id, {
        status: status as any,
        studentId: studentId as string,
      });

      res.json({ mappings });
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   SYNC
   ============================================================ */

/**
 * POST /api/integrations/:id/sync
 * Trigger sync job
 */
router.post('/:id/sync',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  validateBody(syncJobSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const syncJobId = await syncEngine.createSyncJob({
        integrationId: req.params.id,
        type: req.body.type,
        scope: req.body.scope,
        studentIds: req.body.studentIds,
        triggeredBy: req.auth!.userId,
        idempotencyKey: req.body.idempotencyKey,
      });

      // Execute asynchronously
      syncEngine.executeSyncJob(syncJobId).catch(err => {
        logger.error({ err, syncJobId }, 'Sync job execution failed');
      });

      res.status(202).json({ syncJobId, status: 'pending' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/integrations/:id/sync/:jobId
 * Get sync job status
 */
router.get('/:id/sync/:jobId',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema.extend({ jobId: z.string().uuid() })),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const syncJob = await syncEngine.getSyncJobStatus(req.params.jobId);
      res.json({ syncJob });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/integrations/:id/sync
 * List sync jobs
 */
router.get('/:id/sync',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await syncEngine.listSyncJobs(req.params.id, page, limit);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   EVENTS
   (PrepVista consumes via webhook / event API)
   ============================================================ */

/**
 * GET /api/integrations/:id/events
 * List events
 */
router.get('/:id/events',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const [events, total] = await Promise.all([
        prisma.integrationEvent.findMany({
          where: { integrationId: req.params.id },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.integrationEvent.count({ where: { integrationId: req.params.id } }),
      ]);

      res.json({
        events,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/integrations/:id/events/:eventId/retry
 * Retry dead-lettered event
 */
router.post('/:id/events/:eventId/retry',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema.extend({ eventId: z.string().min(1) })),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      await eventDelivery.retryDeadLetter(req.params.eventId, req.auth!.userId);
      res.json({ message: 'Event retry scheduled' });
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   RECONCILIATION
   ============================================================ */

/**
 * POST /api/integrations/:id/reconcile
 * Trigger reconciliation
 */
router.post('/:id/reconcile',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const jobId = await reconciliationService.createReconciliationJob(req.params.id, req.auth!.userId);
      res.status(202).json({ jobId, status: 'pending' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/integrations/:id/reconciliation/status
 * Get reconciliation status
 */
router.get('/:id/reconciliation/status',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const status = await reconciliationService.getReconciliationStatus(req.params.id);
      res.json({ reconciliation: status });
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   AUDIT
   ============================================================ */

/**
 * GET /api/integrations/:id/audit
 * Get audit log
 */
router.get('/:id/audit',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await integrationService.getAuditLog(req.params.id, page, limit);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   HEALTH
   ============================================================ */

/**
 * GET /api/integrations/:id/health
 * Get integration health
 */
router.get('/:id/health',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const integration = await prisma.integration.findUnique({
        where: { id: req.params.id },
        include: {
          credentials: true,
          identityMappings: { where: { status: 'VERIFIED' } },
          mappings: { where: { status: 'VERIFIED' } },
        },
      });

      if (!integration) {
        throw new NotFoundError('Integration');
      }

      const [pendingEvents, failedEvents, deadLetterEvents] = await Promise.all([
        prisma.integrationEvent.count({ where: { integrationId: req.params.id, status: { in: ['PENDING', 'QUEUED'] } } }),
        prisma.integrationEvent.count({ where: { integrationId: req.params.id, status: 'FAILED' } }),
        prisma.integrationEvent.count({ where: { integrationId: req.params.id, status: 'DEAD_LETTER' } }),
      ]);

      // Determine health
      const connection = integration.status === 'ACTIVE' ? 'HEALTHY' : integration.status === 'DEGRADED' ? 'DEGRADED' : 'UNHEALTHY';
      const identityMapping = integration.identityMappings.length > 0 ? 'HEALTHY' : 'NOT_CONFIGURED';
      const synchronization = integration.lastSyncAt ? 'HEALTHY' : 'NOT_STARTED';
      const eventDeliveryHealth = failedEvents > 0 || deadLetterEvents > 0 ? 'DEGRADED' : 'HEALTHY';

      const activeCredential = integration.credentials.find(c => c.status === 'ACTIVE');
      const credentialStatus = activeCredential
        ? (activeCredential.expiresAt && activeCredential.expiresAt < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? 'EXPIRING' : 'VALID')
        : 'MISSING';

      res.json({
        health: {
          connection,
          identityMapping,
          synchronization,
          eventDelivery: eventDeliveryHealth,
          pendingEvents,
          failedEvents,
          deadLetterEvents,
          lastSuccessfulSync: integration.lastSyncAt,
          lastError: integration.lastError,
          credentialStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   WEBHOOK DELIVERY (PrepVista receives via webhook)
   ============================================================ */

/**
 * POST /api/integrations/:id/webhook
 * Webhook delivery from PrepVista (if PrepVista needs to push data)
 * Validates signature
 */
router.post('/:id/webhook',
  webhookRateLimiter,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const integration = await prisma.integration.findUnique({
        where: { id: req.params.id },
      });

      if (!integration) {
        throw new NotFoundError('Integration');
      }

      // Verify webhook signature
      const signature = req.headers['x-signature'] as string;
      const timestamp = req.headers['x-timestamp'] as string;
      const eventId = req.headers['x-event-id'] as string;

      if (!signature || !timestamp || !eventId) {
        throw new ValidationError('Missing webhook headers');
      }

      // Check timestamp freshness (5 min window)
      const ts = parseInt(timestamp);
      if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
        throw new ValidationError('Webhook timestamp too old');
      }

      // Get webhook secret
      const webhookSecret = await integrationService.getActiveCredential(req.params.id, 'WEBHOOK_SECRET');
      if (!webhookSecret) {
        throw new ValidationError('Webhook secret not configured');
      }

      // Verify signature
      const crypto = await import('crypto');
      const expectedSignature = crypto.createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      const providedSignature = signature.replace('sha256=', '');
      if (expectedSignature !== providedSignature) {
        // Record security event
        await prisma.integrationAudit.create({
          data: {
            integrationId: req.params.id,
            action: 'webhook_signature_failed',
            actorId: 'UNKNOWN',
            actorType: 'WEBHOOK',
            metadata: { eventId } as any,
          },
        });
        throw new ValidationError('Invalid webhook signature');
      }

      // Process webhook (replay protection)
      const existing = await prisma.integrationEvent.findUnique({
        where: { eventId },
      });

      if (existing) {
        // Replay detected
        logger.warn({ eventId, integrationId: req.params.id }, 'Webhook replay detected');
        return res.status(200).json({ status: 'duplicate' });
      }

      // Store event (PrepVista → CodeForge direction, e.g., for sync confirmation)
      await prisma.integrationEvent.create({
        data: {
          integrationId: req.params.id,
          eventType: req.body.eventType || 'unknown',
          schemaVersion: req.body.schemaVersion || 'v1',
          eventId,
          source: 'PREPVISTA',
          occurredAt: new Date(timestamp),
          organizationRef: req.body.organizationRef || '',
          externalStudentRef: req.body.externalStudentRef,
          dataVersion: req.body.dataVersion || '1.0',
          payload: req.body.payload || {},
          idempotencyKey: `${eventId}_webhook`,
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });

      logger.info({ eventId, integrationId: req.params.id }, 'Webhook received');
      res.status(200).json({ status: 'received' });
    } catch (error) {
      next(error);
    }
  }
);

/* ============================================================
   PREPVISTA CONSUMPTION API (PrepVista pulls data)
   ============================================================ */

/**
 * POST /api/integrations/:id/profile/:studentId
 * Get technical profile for PrepVista (with PrepVista auth)
 */
router.get('/:id/profile/:studentId',
  authMiddleware,
  requireRole('COLLEGE_ADMIN', 'SUPER_ADMIN', 'TPO'),
  validateParams(idParamSchema.extend({ studentId: z.string().uuid() })),
  async (req, res, next) => {
    try {
      await verifyIntegrationAccess(req, req.params.id);

      const integration = await prisma.integration.findUnique({
        where: { id: req.params.id },
        include: { sharingPolicy: true, college: true },
      });

      if (!integration || integration.status !== 'ACTIVE') {
        throw new ValidationError('Integration not active');
      }

      // Verify student is in integration college
      const student = await prisma.student.findUnique({
        where: { id: req.params.studentId },
      });

      if (!student || student.collegeId !== integration.collegeId) {
        throw new AuthorizationError('Student not in integration college');
      }

      // Get identity mapping
      const identityMapping = await integrationService.getIdentityMappingByCodeforgeStudent(
        req.params.id,
        req.params.studentId
      );

      if (!identityMapping) {
        throw new ValidationError('Student not linked to PrepVista');
      }

      // Check sharing policy
      if (!integration.sharingPolicy) {
        throw new ValidationError('Sharing policy not configured');
      }

      // Build profile
      const profile = await buildTechnicalProfile({
        studentId: req.params.studentId,
        sharingScope: integration.sharingPolicy.defaultScope,
        externalStudentId: identityMapping.externalStudentId,
        organizationId: integration.collegeId,
        contractVersion: 'v1',
      });

      // Filter by scope
      const filteredProfile = filterProfileByScope(profile, integration.sharingPolicy.defaultScope);

      // Record audit
      await integrationService.recordAudit(req.params.id, 'data_requested', req.auth!.userId, 'USER', {
        studentId: req.params.studentId,
        scope: integration.sharingPolicy.defaultScope,
      });

      res.json({ profile: filteredProfile });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

/**
 * GET /api/student/integrations
 * Student-facing integration status endpoint
 */
router.get('/student/integrations',
  authMiddleware,
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const studentId = req.user!.student!.id;
      const collegeId = req.user!.collegeId;

      if (!collegeId) {
        return res.json({ integration: null, preview: null });
      }

      // Find active integration for student's college
      const integration = await prisma.integration.findFirst({
        where: {
          collegeId,
          status: { in: ['ACTIVE', 'DEGRADED', 'CONNECTING'] },
        },
        include: {
          sharingPolicy: true,
          identityMappings: {
            where: { codeforgeStudentId: studentId },
            take: 1,
          },
        },
      });

      if (!integration) {
        return res.json({ integration: null, preview: null });
      }

      const identityMapping = integration.identityMappings[0] || null;

      // Get last profile sync
      const lastSyncRecord = await prisma.syncRecord.findFirst({
        where: {
          syncJob: { integrationId: integration.id },
          studentId,
          status: 'COMPLETED',
        },
        orderBy: { completedAt: 'desc' },
      });

      // Build preview if linked and active
      let preview = null;
      if (integration.status === 'ACTIVE' && identityMapping && identityMapping.status === 'VERIFIED') {
        try {
          const profile = await buildTechnicalProfile({
            studentId,
            sharingScope: integration.sharingPolicy?.defaultScope || 'STANDARD',
            externalStudentId: identityMapping.externalStudentId,
            organizationId: collegeId,
            contractVersion: 'v1',
          });

          preview = {
            scope: integration.sharingPolicy?.defaultScope || 'STANDARD',
            skillsCount: profile.skills.length,
            masteryCount: profile.mastery.length,
            gapsCount: profile.gaps.length,
            readinessRoles: profile.readiness.map(r => r.role),
            evidenceSummary: {
              assessmentCount: profile.assessmentSummary.totalAssessments,
              interviewCount: profile.assessmentSummary.byType.INTERVIEW || 0,
              projectCount: profile.evidenceSummary.projectCount,
              totalEvidencePoints: profile.evidenceSummary.totalEvidencePoints,
            },
            lastSynced: lastSyncRecord?.completedAt?.toISOString() || null,
          };
        } catch (e) {
          logger.warn({ err: e, studentId }, 'Failed to build preview');
        }
      }

      res.json({
        integration: {
          id: integration.id,
          name: integration.name,
          type: integration.type,
          status: integration.status,
          collegeId: integration.collegeId,
          sharingPolicy: integration.sharingPolicy,
        },
        identityMapping: identityMapping ? {
          id: identityMapping.id,
          externalStudentId: identityMapping.externalStudentId,
          status: identityMapping.status,
          mappedAt: identityMapping.mappedAt,
          verifiedAt: identityMapping.verifiedAt,
          revokedAt: identityMapping.revokedAt,
        } : null,
        lastProfileSync: lastSyncRecord?.completedAt?.toISOString() || null,
        preview,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

import { z } from 'zod';
import { buildTechnicalProfile, filterProfileByScope } from '../services/integration';