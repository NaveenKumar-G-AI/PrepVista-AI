import { Router } from 'express';
import admin from './admin';
import alerts from './alerts';
import analytics from './analytics';
import budgets from './budgets';
import execute from './execute';
import models from './models';
import policies from './policies';
import providers from './providers';
import quotas from './quotas';

const router = Router();

router.use('/execute', execute);
router.use('/analytics', analytics);
router.use('/models', models);
router.use('/providers', providers);
router.use('/policies', policies);
router.use('/budgets', budgets);
router.use('/quotas', quotas);
router.use('/alerts', alerts);
router.use('/admin', admin);

export default router;
