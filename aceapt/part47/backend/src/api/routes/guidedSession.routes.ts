import { Router } from 'express';
import type { GuidedSolvingService } from '../../services/guidedSolvingService.js';
import { buildGuidedSessionController } from '../controllers/guidedSession.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * Route -> conceptual API name from Section 71:
 *   GET    /problems                                    (demo helper - see README)
 *   POST   /sessions                                     startGuidedSession
 *   GET    /sessions/:sessionId                          getGuidedSession
 *   GET    /sessions/:sessionId/current-step             getCurrentStep
 *   POST   /sessions/:sessionId/steps/:stepId/submit      submitStep
 *   POST   /sessions/:sessionId/steps/:stepId/retry       retryStep
 *   POST   /sessions/:sessionId/steps/:stepId/skip        skipStep
 *   POST   /sessions/:sessionId/steps/:stepId/guidance    requestGuidance
 *   POST   /sessions/:sessionId/steps/:stepId/explain     requestExplanation
 *   POST   /sessions/:sessionId/show-next-step            showNextStep
 *   POST   /sessions/:sessionId/reveal-solution           (solution reveal, Section 28)
 *   POST   /sessions/:sessionId/reconstruction            (solution reconstruction, Section 29)
 *   POST   /sessions/:sessionId/complete                  completeGuidedSession
 *   POST   /sessions/:sessionId/verification               startVerification
 *   GET    /sessions/:sessionId/summary                   getGuidedSummary
 *   POST   /sessions/:sessionId/feedback                  (student feedback, Section 85)
 *   POST   /sessions/:sessionId/abandon                   (Section 8 lifecycle)
 */
export function buildGuidedSessionRouter(service: GuidedSolvingService): Router {
  const router = Router();
  const controller = buildGuidedSessionController(service);

  router.use(requireAuth);

  router.get('/problems', asyncHandler(controller.listProblems));

  router.post('/sessions', asyncHandler(controller.startSession));
  router.get('/sessions/:sessionId', asyncHandler(controller.getSession));
  router.get('/sessions/:sessionId/current-step', asyncHandler(controller.getCurrentStep));
  router.post('/sessions/:sessionId/steps/:stepId/submit', asyncHandler(controller.submitStep));
  router.post('/sessions/:sessionId/steps/:stepId/retry', asyncHandler(controller.retryStep));
  router.post('/sessions/:sessionId/steps/:stepId/skip', asyncHandler(controller.skipStep));
  router.post('/sessions/:sessionId/steps/:stepId/guidance', asyncHandler(controller.requestGuidance));
  router.post('/sessions/:sessionId/steps/:stepId/explain', asyncHandler(controller.requestExplanation));
  router.post('/sessions/:sessionId/show-next-step', asyncHandler(controller.showNextStep));
  router.post('/sessions/:sessionId/reveal-solution', asyncHandler(controller.revealFullSolution));
  router.post('/sessions/:sessionId/reconstruction', asyncHandler(controller.submitReconstruction));
  router.post('/sessions/:sessionId/complete', asyncHandler(controller.completeSession));
  router.post('/sessions/:sessionId/verification', asyncHandler(controller.startVerification));
  router.get('/sessions/:sessionId/summary', asyncHandler(controller.getSummary));
  router.post('/sessions/:sessionId/feedback', asyncHandler(controller.submitFeedback));
  router.post('/sessions/:sessionId/abandon', asyncHandler(controller.abandonSession));

  return router;
}
