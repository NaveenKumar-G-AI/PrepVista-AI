import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS, requireAuth, requireSelfOrPermission } from '../middleware/security';
import { EvidenceIngestService } from '../services/evidenceIngestService';
import { NotFoundError, ReadinessService } from '../services/readinessService';

/**
 * Route shape follows the brief's own sketch (section 39):
 *   GET  /students/:studentId/roles
 *   GET  /students/:studentId/readiness/:roleId
 *   GET  /students/:studentId/readiness/:roleId/journey
 *   GET  /students/:studentId/opportunities/:opportunityId/readiness
 *   POST /students/:studentId/evidence
 *
 * One difference from the brief's per-section sketch (capabilities/evidence/
 * gaps/next-proof as separate endpoints): those all come out of the same
 * single readiness computation, so they're returned together on
 * GET /readiness/:roleId rather than as separate round trips that would
 * each recompute the same thing — see the performance note in README.md.
 * If your API gateway conventions require separate resources, splitting
 * these fields into their own routes is a thin, mechanical change.
 *
 * Mount this router behind your existing authentication middleware — see
 * middleware/security.ts for exactly what it expects on `req.user`.
 */
export function buildReadinessRouter(readinessService: ReadinessService, evidenceIngestService: EvidenceIngestService): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/students/:studentId/roles', requireSelfOrPermission(PERMISSIONS.VIEW_STUDENT_EVIDENCE), async (req, res, next) => {
    try {
      const roles = await readinessService.listTargetRoles(req.user!.tenantId, req.params.studentId);
      res.json({ roles });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    '/students/:studentId/readiness/:roleId',
    requireSelfOrPermission(PERMISSIONS.VIEW_STUDENT_EVIDENCE),
    async (req, res, next) => {
      try {
        const dto = await readinessService.getRoleReadiness(req.user!.tenantId, req.params.studentId, req.params.roleId);
        res.json(dto);
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/students/:studentId/readiness/:roleId/journey',
    requireSelfOrPermission(PERMISSIONS.VIEW_STUDENT_EVIDENCE),
    async (req, res, next) => {
      try {
        const journey = await readinessService.getReadinessJourney(req.user!.tenantId, req.params.studentId, req.params.roleId);
        res.json({ journey });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/students/:studentId/readiness/:roleId/capabilities/:capabilityId/evidence',
    requireSelfOrPermission(PERMISSIONS.VIEW_STUDENT_EVIDENCE),
    async (req, res, next) => {
      try {
        const evidence = await readinessService.getCapabilityEvidence(req.user!.tenantId, req.params.studentId, req.params.capabilityId);
        res.json({ evidence });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/students/:studentId/opportunities/:opportunityId/readiness',
    requireSelfOrPermission(PERMISSIONS.VIEW_STUDENT_EVIDENCE),
    async (req, res, next) => {
      try {
        const dto = await readinessService.getOpportunityReadiness(req.user!.tenantId, req.params.studentId, req.params.opportunityId);
        res.json(dto);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/students/:studentId/evidence',
    requireSelfOrPermission(PERMISSIONS.WRITE_STUDENT_EVIDENCE),
    async (req, res, next) => {
      try {
        const evidence = await evidenceIngestService.ingest(req.user!.tenantId, req.params.studentId, req.body);
        res.status(201).json({ evidence });
      } catch (err) {
        next(err);
      }
    }
  );

  router.use(notFoundHandler);
  router.use(errorHandler);
  return router;
}

function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND', message: `No readiness route matches ${req.method} ${req.path}.` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: 'NOT_FOUND', message: err.message });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid evidence payload.', details: err.issues });
    return;
  }
  // Never fabricate a readiness result when something upstream failed — surface a clear,
  // honest failure state instead (brief, section 53).
  // eslint-disable-next-line no-console
  console.error('[feature-37] unhandled route error', err);
  res.status(503).json({ error: 'TEMPORARILY_UNAVAILABLE', message: 'Readiness analysis is temporarily unavailable. Please try again shortly.' });
}
