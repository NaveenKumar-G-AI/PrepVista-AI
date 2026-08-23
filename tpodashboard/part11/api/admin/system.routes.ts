import { Router } from 'express';
import { authenticate } from '../../src/middleware/authenticate';
import { requirePermission } from '../../services/authorization/rbac';
import { getSystemHealth, getIntegrationStatus } from '../../services/system/systemService';

const router = Router();
router.use(authenticate, requirePermission('settings.read'));

router.get('/health', (_req, res) => res.json(getSystemHealth()));
router.get('/integrations', (_req, res) => res.json(getIntegrationStatus()));

export default router;
