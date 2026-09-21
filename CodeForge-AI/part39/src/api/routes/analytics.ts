import { Router } from 'express';
import { telemetry } from '../../telemetry/Telemetry';
import { DASHBOARD_ROLES, Role } from '../../types';
import { assertOrgAccess } from '../middleware/tenant';
import { requireRole } from '../middleware/auth';

const router = Router();
router.use(requireRole(DASHBOARD_ROLES));

function resolveRecords(req: import('express').Request) {
  const auth = req.auth!;
  const requested = req.query.organizationId as string | undefined;
  const sinceMs = req.query.sinceMs ? Number(req.query.sinceMs) : 24 * 60 * 60 * 1000;

  if (requested === 'all') {
    if (auth.role !== Role.PLATFORM_ADMIN && auth.role !== Role.ENGINEERING_OPERATOR) {
      const err = new Error('Cross-organization access is not permitted for this role');
      (err as Error & { statusCode?: number }).statusCode = 403;
      throw err;
    }
    return telemetry.all(sinceMs);
  }
  const orgId = assertOrgAccess(auth, requested);
  return telemetry.forOrganization(orgId, sinceMs);
}

router.get('/overview', (req, res, next) => {
  try {
    res.json(telemetry.overview(resolveRecords(req)));
  } catch (err) {
    next(err);
  }
});

router.get('/breakdown', (req, res, next) => {
  try {
    const dimension = req.query.dimension as 'feature' | 'task' | 'modelId' | 'provider' | undefined;
    if (!dimension || !['feature', 'task', 'modelId', 'provider'].includes(dimension)) {
      res.status(400).json({ error: 'dimension must be one of: feature, task, modelId, provider' });
      return;
    }
    res.json(telemetry.breakdownBy(resolveRecords(req), dimension));
  } catch (err) {
    next(err);
  }
});

router.get('/timeseries', (req, res, next) => {
  try {
    const bucketMs = req.query.bucketMs ? Number(req.query.bucketMs) : 60 * 60 * 1000; // default hourly
    if (!Number.isFinite(bucketMs) || bucketMs < 1000) {
      res.status(400).json({ error: 'bucketMs must be a number >= 1000' });
      return;
    }
    res.json(telemetry.bucketed(resolveRecords(req), bucketMs));
  } catch (err) {
    next(err);
  }
});

export default router;
