import { Router } from 'express';
import { z } from 'zod';
import type { ContextSourceRepository, StrategyStore } from '../repositories/types.js';
import type { LLMProvider } from '../ai/llmProvider.js';
import { buildCommandCenterView, buildTimeline } from '../services/strategyService.js';
import { buildStrategyContext } from '../engines/contextBuilder.js';
import { generateStrategyReview } from '../services/narrativeServices.js';
import { confirmStrategyChange } from '../services/decisionService.js';
import { devAuth, enforceStudentIsolation, rateLimit, type AuthedRequest } from '../middleware/index.js';

export function strategyRoutes(sources: ContextSourceRepository, store: StrategyStore, llm: LLMProvider): Router {
  const router = Router();
  router.use(devAuth, rateLimit);

  // spec #45-46: CAREER COMMAND CENTER — the primary screen.
  router.get('/command-center/:studentId', enforceStudentIsolation(), async (req: AuthedRequest, res, next) => {
    try {
      const view = await buildCommandCenterView(req.params.studentId!, sources, store, llm);
      res.json(view);
    } catch (err) {
      next(err);
    }
  });

  // spec #19-20: strategy versions + comparison.
  router.get('/strategy/:studentId/versions', enforceStudentIsolation(), async (req: AuthedRequest, res, next) => {
    try {
      const strategy = await store.getOrCreateStrategy(req.params.studentId!);
      const versions = await store.listVersions(strategy.id);
      res.json({ strategyId: strategy.id, status: strategy.status, versions });
    } catch (err) {
      next(err);
    }
  });

  const ConfirmChangeBody = z.object({
    newTargetRole: z.string().min(1),
    newGoalId: z.string().nullable().optional(),
    reason: z.string().min(1),
    assumptions: z.array(z.string()).default([]),
  });

  // spec #78: STRATEGY CHANGE CONFIRMATION — the only route that creates a
  // new strategy version. Never called implicitly by the recommendation flow.
  router.post('/strategy/:studentId/confirm-change', enforceStudentIsolation(), async (req: AuthedRequest, res, next) => {
    try {
      const body = ConfirmChangeBody.parse(req.body);
      const strategy = await store.getOrCreateStrategy(req.params.studentId!);
      const version = await confirmStrategyChange(
        { strategyId: strategy.id, newTargetRole: body.newTargetRole, newGoalId: body.newGoalId ?? null, reason: body.reason, assumptions: body.assumptions },
        store,
      );
      res.status(201).json(version);
    } catch (err) {
      next(err);
    }
  });

  // spec #79: CAREER STRATEGY TIMELINE.
  router.get('/timeline/:studentId', enforceStudentIsolation(), async (req: AuthedRequest, res, next) => {
    try {
      const strategy = await store.getOrCreateStrategy(req.params.studentId!);
      const timeline = await buildTimeline(strategy.id, store);
      res.json({ strategyId: strategy.id, timeline });
    } catch (err) {
      next(err);
    }
  });

  // spec #24: WEEKLY CAREER REVIEW.
  router.post('/review/:studentId/generate', enforceStudentIsolation(), async (req: AuthedRequest, res, next) => {
    try {
      const ctx = await buildStrategyContext(req.params.studentId!, sources, store);
      const review = await generateStrategyReview(ctx, store);
      res.status(201).json(review);
    } catch (err) {
      next(err);
    }
  });

  router.get('/review/:studentId/latest', enforceStudentIsolation(), async (req: AuthedRequest, res, next) => {
    try {
      const strategy = await store.getOrCreateStrategy(req.params.studentId!);
      const review = await store.getLatestReview(strategy.id);
      res.json(review);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
