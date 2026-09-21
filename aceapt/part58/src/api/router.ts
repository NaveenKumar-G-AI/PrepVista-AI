/**
 * API router (§129-130). Built as a factory that takes the facade service so
 * the whole module is dependency-injected end to end — server.ts wires real
 * adapters, tests can wire fakes.
 *
 * Route <-> spec operation mapping:
 *   GET  /profile/:studentId              -> getDecisionProfile
 *   GET  /history/:studentId              -> getDecisionHistory
 *   GET  /insights/:studentId             -> getDecisionInsights
 *   POST /training/start                  -> startDecisionTraining
 *   GET  /training/scenario/:scenarioId   -> getDecisionScenario
 *   POST /training/submit                 -> submitDecision
 *   GET  /calibration/:studentId          -> getConfidenceCalibration
 *   GET  /skipping/:studentId             -> getSkippingAnalysis
 *   GET  /answer-switch/:studentId        -> getAnswerSwitchAnalysis
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { GuessingIntelligenceService } from '../services/guessingIntelligenceService';
import type { DecisionPolicyService } from '../services/decisionPolicyService';
import { authorizeStudentResource, requireAuth } from '../middleware/auth';
import { assessmentIntegrityGuard } from '../middleware/assessmentIntegrityGuard';
import { listQuerySchema, startTrainingSchema, submitDecisionSchema } from '../validation';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/** Every request scopes repository access to the authenticated tenant — never trust a client-supplied tenantId over the auth context. */
function tenantOf(req: Request): string {
  if (!req.auth) throw new Error('tenantOf called before requireAuth');
  return req.auth.tenantId;
}

export function buildDecisionRouter(deps: {
  guessingIntelligence: GuessingIntelligenceService;
  decisionPolicy: DecisionPolicyService;
}): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(assessmentIntegrityGuard);

  router.get(
    '/profile/:studentId',
    authorizeStudentResource('studentId'),
    asyncHandler(async (req, res) => {
      const profile = await deps.guessingIntelligence.getDecisionProfile(tenantOf(req), req.params.studentId);
      res.json(profile);
    })
  );

  router.get(
    '/history/:studentId',
    authorizeStudentResource('studentId'),
    asyncHandler(async (req, res) => {
      const opts = listQuerySchema.parse(req.query);
      const history = await deps.guessingIntelligence.getDecisionHistory(tenantOf(req), req.params.studentId, opts);
      res.json({ history });
    })
  );

  router.get(
    '/insights/:studentId',
    authorizeStudentResource('studentId'),
    asyncHandler(async (req, res) => {
      const insights = await deps.guessingIntelligence.getDecisionInsights(tenantOf(req), req.params.studentId);
      res.json({ insights });
    })
  );

  router.post(
    '/training/start',
    asyncHandler(async (req, res) => {
      const body = startTrainingSchema.parse({ ...req.body, tenantId: tenantOf(req) });
      const scenario = await deps.guessingIntelligence.startDecisionTraining(
        body.tenantId,
        body.studentId,
        body.mode,
        body.difficultyLevel
      );
      res.json({ scenario });
    })
  );

  router.get(
    '/training/scenario/:scenarioId',
    asyncHandler(async (req, res) => {
      const scenario = await deps.guessingIntelligence.getDecisionScenario(tenantOf(req), req.params.scenarioId);
      res.json({ scenario });
    })
  );

  router.post(
    '/training/submit',
    asyncHandler(async (req, res) => {
      const body = submitDecisionSchema.parse({ ...req.body, tenantId: tenantOf(req) });
      const policy = body.assessmentVersionId
        ? await deps.decisionPolicy.getActivePolicy(body.tenantId, body.assessmentVersionId)
        : null;
      res.locals.policy = policy; // read by assessmentIntegrityGuard
      const { gradedIsCorrect, ...eventInput } = body;
      const result = await deps.guessingIntelligence.submitDecision(eventInput, { gradedIsCorrect, policy });
      res.json(result);
    })
  );

  router.get(
    '/calibration/:studentId',
    authorizeStudentResource('studentId'),
    asyncHandler(async (req, res) => {
      const misalignments = await deps.guessingIntelligence.getConfidenceCalibration(tenantOf(req), req.params.studentId);
      res.json({ misalignments });
    })
  );

  router.get(
    '/skipping/:studentId',
    authorizeStudentResource('studentId'),
    asyncHandler(async (req, res) => {
      const analysis = await deps.guessingIntelligence.getSkippingAnalysis(tenantOf(req), req.params.studentId);
      res.json({ analysis });
    })
  );

  router.get(
    '/answer-switch/:studentId',
    authorizeStudentResource('studentId'),
    asyncHandler(async (req, res) => {
      const analysis = await deps.guessingIntelligence.getAnswerSwitchAnalysis(tenantOf(req), req.params.studentId);
      res.json(analysis);
    })
  );

  return router;
}
