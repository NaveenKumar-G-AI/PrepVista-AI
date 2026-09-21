import { Router } from 'express';
import { requireAuth, requireRole, requireSelfOrElevated } from '../middleware/auth';
import * as controller from '../controllers/align.controller';
import * as tpoController from '../controllers/tpo.controller';

export const alignRouter = Router();

// Every route below requires a verified token; some also require the
// caller be the student in question (or tpo/trainer/service).
alignRouter.use(requireAuth);

alignRouter.get('/', controller.getDashboard);
alignRouter.get('/targets', controller.listTargets);
alignRouter.get('/targets/:targetId', controller.getTargetDetail);
alignRouter.get('/capabilities', controller.listCapabilities);
alignRouter.get('/history', controller.getHistory);

alignRouter.post('/recalculate', controller.recalculate);
alignRouter.post('/scenario', controller.runScenario);
alignRouter.post('/target', controller.selectTarget);
alignRouter.post('/targets/:targetId/improve-gap', controller.improveGap);
alignRouter.post('/targets/:targetId/prove', controller.proveTarget);

// Explicit :studentId variants for tpo/trainer looking at one student.
alignRouter.get('/students/:studentId', requireSelfOrElevated, controller.getDashboard);
alignRouter.get('/students/:studentId/targets/:targetId', requireSelfOrElevated, controller.getTargetDetail);

// Inbound from the real Feature 28 (PROOF) — see docs/INTEGRATION.md. Not
// behind requireAuth's bearer-token check; it has its own signature check
// (PROOF_WEBHOOK_SECRET) inside the controller.
export const proofWebhookRouter = Router();
proofWebhookRouter.post('/webhooks/proof-completed', controller.proofCompletedWebhook);

export const tpoRouter = Router();
tpoRouter.use(requireAuth, requireRole('tpo', 'service'));
tpoRouter.get('/cohort', tpoController.getCohortOverview);
