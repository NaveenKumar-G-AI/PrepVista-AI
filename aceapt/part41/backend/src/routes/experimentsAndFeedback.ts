import { Router } from 'express';
import { z } from 'zod';
import type { StrategyStore } from '../repositories/types.js';
import { startExperiment, concludeExperiment } from '../engines/experimentEngine.js';
import { devAuth, enforceStudentIsolation, rateLimit, type AuthedRequest } from '../middleware/index.js';
import { eventBus } from '../events/eventBus.js';

const NewExperimentBody = z.object({
  hypothesis: z.string().min(1),
  action: z.string().min(1),
  expectedOutcome: z.string().min(1),
  measurement: z.string().min(1),
  timeWindowDays: z.number().int().positive().max(180),
});

const ConcludeExperimentBody = z.object({
  actualOutcome: z.string().min(1),
  matched: z.union([z.boolean(), z.literal('inconclusive')]),
});

const FeedbackBody = z.object({
  feedback: z.enum(['helpful', 'not_helpful', 'already_done', 'not_possible', 'wrong_context']),
  notNowReason: z.enum(['too_expensive', 'too_time_consuming', 'not_relevant', 'wrong_timing', 'need_information', 'personal_reason']).optional(),
});

export function experimentsAndFeedbackRoutes(store: StrategyStore): Router {
  const router = Router();
  router.use(devAuth, rateLimit);

  // spec #28-30: CAREER EXPERIMENTS / HYPOTHESIS SYSTEM
  router.post('/experiments/:studentId', enforceStudentIsolation(), async (req: AuthedRequest, res, next) => {
    try {
      const body = NewExperimentBody.parse(req.body);
      const strategy = await store.getOrCreateStrategy(req.params.studentId!);
      const experiment = await store.createExperiment({ strategyId: strategy.id, status: 'planned', ...body });
      res.status(201).json(experiment);
    } catch (err) {
      next(err);
    }
  });

  router.post('/experiments/:experimentId/start', async (req, res, next) => {
    try {
      const experiment = await store.getExperiment(req.params.experimentId!);
      if (!experiment) { res.status(404).json({ error: 'Experiment not found' }); return; }
      const started = startExperiment(experiment);
      const saved = await store.updateExperiment(started.id, started);
      eventBus.publish('experiment_started', { experimentId: saved.id, strategyId: saved.strategyId });
      res.json(saved);
    } catch (err) {
      next(err);
    }
  });

  router.post('/experiments/:experimentId/conclude', async (req, res, next) => {
    try {
      const body = ConcludeExperimentBody.parse(req.body);
      const experiment = await store.getExperiment(req.params.experimentId!);
      if (!experiment) { res.status(404).json({ error: 'Experiment not found' }); return; }
      const concluded = concludeExperiment(experiment, body.actualOutcome, body.matched);
      const saved = await store.updateExperiment(concluded.id, concluded);
      eventBus.publish('experiment_completed', { experimentId: saved.id, strategyId: saved.strategyId, status: saved.status });
      res.json(saved);
    } catch (err) {
      next(err);
    }
  });

  router.get('/experiments/:studentId', enforceStudentIsolation(), async (req: AuthedRequest, res, next) => {
    try {
      const strategy = await store.getOrCreateStrategy(req.params.studentId!);
      res.json(await store.listExperiments(strategy.id));
    } catch (err) {
      next(err);
    }
  });

  // spec #49-51: RECOMMENDATION FEEDBACK / "NOT NOW"
  router.post('/recommendations/:recommendationId/feedback', async (req, res, next) => {
    try {
      const body = FeedbackBody.parse(req.body);
      await store.saveRecommendationFeedback(req.params.recommendationId!, body.feedback, body.notNowReason);
      eventBus.publish('recommendation_feedback', { recommendationId: req.params.recommendationId, feedback: body.feedback, notNowReason: body.notNowReason });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
