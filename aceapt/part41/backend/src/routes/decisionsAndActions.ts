import { Router } from 'express';
import { z } from 'zod';
import type { StrategyStore } from '../repositories/types.js';
import type { InMemoryContextSourceRepository } from '../repositories/inMemoryRepository.js';
import { recordDecision } from '../services/decisionService.js';
import { devAuth, enforceStudentIsolation, rateLimit, type AuthedRequest } from '../middleware/index.js';
import { eventBus } from '../events/eventBus.js';

const DecisionBody = z.object({
  question: z.string().min(1),
  optionsConsidered: z.array(z.string()).min(1),
  chosenOption: z.string().min(1),
  impliedTargetRole: z.string().optional(),
});

const ActionStatusBody = z.object({
  status: z.enum(['accepted', 'not_now', 'in_progress', 'completed', 'skipped']),
  notNowReason: z.enum(['too_expensive', 'too_time_consuming', 'not_relevant', 'wrong_timing', 'need_information', 'personal_reason']).optional(),
});

/**
 * NOTE ON `sources`: this route accepts InMemoryContextSourceRepository
 * specifically (not the generic ContextSourceRepository interface) because
 * it needs the demo-only addDecision() mutator. In your real integration,
 * decisions are almost certainly recorded by ACEAPT's existing decision
 * feature, not here — call recordDecision() from decisionService.ts with a
 * persistDecision callback that writes to your real table/queue instead of
 * exposing a write route on this module at all.
 */
export function decisionsAndActionsRoutes(sources: InMemoryContextSourceRepository, store: StrategyStore): Router {
  const router = Router();
  router.use(devAuth, rateLimit);

  // spec #17-18, #33-34, #77-78
  router.post('/decisions/:studentId', enforceStudentIsolation(), async (req: AuthedRequest, res, next) => {
    try {
      const body = DecisionBody.parse(req.body);
      const studentId = req.params.studentId!;
      const result = await recordDecision(
        { studentId, ...body },
        sources,
        store,
        (d) => sources.addDecision(studentId, d),
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // spec #49-50: accept / "Not now" / complete an action, with feedback.
  router.patch('/actions/:actionId/status', async (req: AuthedRequest, res, next) => {
    try {
      const body = ActionStatusBody.parse(req.body);
      const action = await store.updateActionStatus(req.params.actionId!, body.status, body.notNowReason);
      if (body.status === 'completed') eventBus.publish('action_completed', { actionId: action.id, strategyId: action.strategyId });
      if (body.status === 'not_now') eventBus.publish('action_skipped', { actionId: action.id, strategyId: action.strategyId, reason: body.notNowReason });
      if (body.status === 'in_progress' || body.status === 'accepted') eventBus.publish('action_started', { actionId: action.id, strategyId: action.strategyId });
      res.json(action);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
