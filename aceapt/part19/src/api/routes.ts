import { Router } from 'express';
import { RetentionService } from '../services/RetentionService';

export function buildRetentionRouter(service: RetentionService): Router {
  const router = Router();

  // Feature 14 calls this the moment a concept becomes MASTERED.
  router.post('/students/:studentId/mastery-entries', async (req, res, next) => {
    try {
      const { conceptId } = req.body;
      const state = await service.onConceptMastered(req.params.studentId, conceptId);
      res.status(201).json(state);
    } catch (e) {
      next(e);
    }
  });

  router.get('/students/:studentId/today-memory-check', async (req, res, next) => {
    try {
      res.json(await service.getTodaysMemoryCheck(req.params.studentId));
    } catch (e) {
      next(e);
    }
  });

  router.get('/students/:studentId/knowledge-states', async (req, res, next) => {
    try {
      res.json(await service.listKnowledgeStates(req.params.studentId));
    } catch (e) {
      next(e);
    }
  });

  router.post('/students/:studentId/recall-sessions', async (req, res, next) => {
    try {
      const { conceptIds, type } = req.body;
      res.status(201).json(await service.startRecallSession(req.params.studentId, conceptIds, type));
    } catch (e) {
      next(e);
    }
  });

  router.post('/recall-sessions/:sessionId/attempts', async (req, res, next) => {
    try {
      res.status(201).json(await service.submitRetrievalAttempt(req.params.sessionId, req.body));
    } catch (e) {
      next(e);
    }
  });

  router.post('/students/:studentId/concepts/:conceptId/reactivation', async (req, res, next) => {
    try {
      res.status(201).json(await service.startReactivation(req.params.studentId, req.params.conceptId));
    } catch (e) {
      next(e);
    }
  });

  router.post('/reactivation-sessions/:sessionId/steps', async (req, res, next) => {
    try {
      const { phase, correct, latencyMs, hintsUsed, explanationRequested, context, confidenceSelfReport } = req.body;
      res.status(201).json(
        await service.submitReactivationStep(req.params.sessionId, phase, correct, {
          latencyMs,
          hintsUsed,
          explanationRequested,
          context,
          confidenceSelfReport,
        })
      );
    } catch (e) {
      next(e);
    }
  });

  router.get('/students/:studentId/dashboard', async (req, res, next) => {
    try {
      res.json(await service.getKnowledgeHealthDashboard(req.params.studentId));
    } catch (e) {
      next(e);
    }
  });

  router.get('/analytics/observability', async (req, res, next) => {
    try {
      const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
      res.json(await service.getObservability(studentId));
    } catch (e) {
      next(e);
    }
  });

  return router;
}
