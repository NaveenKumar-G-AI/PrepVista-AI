import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../src/middleware/authenticate';
import { requirePermission } from '../../services/authorization/rbac';
import * as policyService from '../../services/policy/policyService';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('policies.read'), (req, res) => {
  res.json(policyService.listPolicyKeys(req.authUser!.institutionId));
});

router.get('/:key/history', requirePermission('policies.read'), (req, res) => {
  res.json(policyService.getPolicyHistory(req.authUser!.institutionId, req.params.key));
});

const createSchema = z.object({ config: z.record(z.any()), effectiveDate: z.string(), reason: z.string().optional() });

router.post('/:key', requirePermission('policies.write'), (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const policy = policyService.createPolicyVersion(req.authUser!, {
      key: req.params.key, config: input.config, effectiveDate: input.effectiveDate, reason: input.reason,
    });
    res.status(201).json(policy);
  } catch (err) { next(err); }
});

export default router;
