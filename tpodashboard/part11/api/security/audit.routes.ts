import { Router } from 'express';
import { authenticate } from '../../src/middleware/authenticate';
import { requirePermission } from '../../services/authorization/rbac';
import { listAudit } from '../../services/audit/auditService';

const router = Router();
router.use(authenticate, requirePermission('audit.read'));

router.get('/', (req, res) => {
  const { actorId, action, entityType, from, to, page, pageSize } = req.query;
  res.json(listAudit({
    institutionId: req.authUser!.institutionId,
    actorId: actorId as string | undefined,
    action: action as string | undefined,
    entityType: entityType as string | undefined,
    from: from as string | undefined,
    to: to as string | undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  }));
});

// Not a separate table — a filtered view over the same immutable audit log (spec section 38).
router.get('/security-events', (req, res) => {
  res.json(listAudit({ institutionId: req.authUser!.institutionId, securityOnly: true }));
});

export default router;
