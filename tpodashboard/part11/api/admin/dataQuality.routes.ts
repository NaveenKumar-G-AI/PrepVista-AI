import { Router } from 'express';
import { authenticate } from '../../src/middleware/authenticate';
import { requirePermission } from '../../services/authorization/rbac';
import { runDataQualityChecks } from '../../services/data-quality/dataQualityService';

const router = Router();
router.use(authenticate, requirePermission('data_quality.read'));

router.get('/', (req, res) => {
  res.json(runDataQualityChecks(req.authUser!.institutionId));
});

export default router;
