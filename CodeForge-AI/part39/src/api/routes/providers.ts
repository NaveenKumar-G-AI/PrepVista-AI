import { Router } from 'express';
import { providerHealthCache } from '../../gateway/defaultGateway';
import { providerRegistry } from '../../providers/ProviderRegistry';
import { DASHBOARD_ROLES } from '../../types';
import { requireRole } from '../middleware/auth';

const router = Router();
router.use(requireRole(DASHBOARD_ROLES));

router.get('/', (_req, res) => {
  res.json(providerRegistry.list().map((p) => p.metadata()));
});

router.get('/health', async (req, res, next) => {
  try {
    if (req.query.refresh === 'true') await providerHealthCache.refresh();
    const cached = providerHealthCache.getAll();
    // If nothing has been checked yet (fresh boot, no background refresh
    // started), do one synchronous check rather than reporting an empty list.
    if (cached.length === 0) await providerHealthCache.refresh();
    res.json(providerHealthCache.getAll());
  } catch (err) {
    next(err);
  }
});

export default router;
