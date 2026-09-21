import { Router } from 'express';
import { z } from 'zod';
import { auditLog } from '../../telemetry/AuditLog';
import { modelRegistry } from '../../registry/ModelRegistry';
import { CONFIG_WRITE_ROLES, DASHBOARD_ROLES, ModelStatus } from '../../types';
import { requireRole } from '../middleware/auth';

const router = Router();
router.use(requireRole(DASHBOARD_ROLES));

router.get('/', (_req, res) => {
  res.json(modelRegistry.list());
});

const statusSchema = z.object({ status: z.nativeEnum(ModelStatus) });

router.patch('/:id/status', requireRole(CONFIG_WRITE_ROLES), (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const modelId = decodeURIComponent(req.params.id);
    const updated = modelRegistry.setStatus(modelId, status);
    auditLog.record('CONFIGURATION_CHANGE', { entity: 'model', modelId, status }, { organizationId: req.auth!.organizationId, actorId: req.auth!.userId, actorRole: req.auth!.role, target: modelId });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
