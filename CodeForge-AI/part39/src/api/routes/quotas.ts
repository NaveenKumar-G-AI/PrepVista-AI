import { Router } from 'express';
import { z } from 'zod';
import { quotaEngine } from '../../budget/QuotaEngine';
import { auditLog } from '../../telemetry/AuditLog';
import { CONFIG_WRITE_ROLES, DASHBOARD_ROLES } from '../../types';
import { requireRole } from '../middleware/auth';

const router = Router();
router.use(requireRole(DASHBOARD_ROLES));

router.get('/', (_req, res) => {
  res.json(quotaEngine.list());
});

const configureSchema = z.object({
  scope: z.enum(['USER', 'ORGANIZATION', 'FEATURE', 'TASK']),
  scopeRef: z.string().min(1),
  limitCount: z.number().int().positive(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

router.post('/', requireRole(CONFIG_WRITE_ROLES), (req, res, next) => {
  try {
    const auth = req.auth!;
    const body = configureSchema.parse(req.body);
    const record = quotaEngine.configure(body.scope, body.scopeRef, body.limitCount, body.periodStart, body.periodEnd);
    auditLog.record('CONFIGURATION_CHANGE', { entity: 'quota', ...body }, { organizationId: auth.organizationId, actorId: auth.userId, actorRole: auth.role, target: `${body.scope}:${body.scopeRef}` });
    res.json(record);
  } catch (err) {
    next(err);
  }
});

export default router;
