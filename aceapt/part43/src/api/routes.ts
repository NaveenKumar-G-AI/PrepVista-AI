import { Response, Router } from 'express';
import { ZodError } from 'zod';
import { AdaptiveDiagnosticEngine, EngineError } from '../engine/AdaptiveDiagnosticEngine';
import { AuthenticatedRequest, requireAuth } from './middleware/auth';
import { startDiagnosticSchema, submitResponseSchema } from './validation';

/**
 * Maps directly onto spec section 62's named operations:
 *   startAdaptiveDiagnostic      -> POST   /adaptive-diagnostics
 *   getNextAdaptiveQuestion      -> GET    /adaptive-diagnostics/:sessionId/next-question
 *   submitAdaptiveResponse       -> POST   /adaptive-diagnostics/:sessionId/responses
 *   getAdaptiveState             -> GET    /adaptive-diagnostics/:sessionId/state
 *   pauseAdaptiveDiagnostic      -> POST   /adaptive-diagnostics/:sessionId/pause
 *   resumeAdaptiveDiagnostic     -> POST   /adaptive-diagnostics/:sessionId/resume
 *   completeAdaptiveDiagnostic   -> POST   /adaptive-diagnostics/:sessionId/complete
 *   getAdaptiveResult            -> GET    /adaptive-diagnostics/:sessionId/result
 * plus one addition, the "Why" feature (spec section 52):
 *   explainAdaptiveSkill         -> GET    /adaptive-diagnostics/:sessionId/why/:skillId
 *
 * Rename these paths to match your project's actual REST conventions if
 * they differ - nothing in engine/ depends on this file's shape.
 */
export function buildAdaptiveDiagnosticRouter(engine: AdaptiveDiagnosticEngine): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/adaptive-diagnostics', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = startDiagnosticSchema.parse(req.body);
      const state = await engine.startSession({
        student: { studentId: req.auth!.studentId, tenantId: parsed.tenantId ?? req.auth!.tenantId },
        config: {
          objective: parsed.objective,
          companyId: parsed.companyId,
          requiredDomains: parsed.requiredDomains,
          minQuestionsPerDomain: parsed.minQuestionsPerDomain,
          maxQuestions: parsed.maxQuestions,
          minQuestions: parsed.minQuestions,
          targetEvidenceConfidence: parsed.targetEvidenceConfidence,
          reassessmentBaselineSessionId: parsed.reassessmentBaselineSessionId,
        },
      });
      res.status(201).json({ sessionId: state.sessionId, status: state.status });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/adaptive-diagnostics/:sessionId/next-question', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await engine.getNextQuestion(req.params.sessionId, req.auth!.studentId);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/adaptive-diagnostics/:sessionId/responses', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = submitResponseSchema.parse(req.body);
      const progress = await engine.submitResponse(req.params.sessionId, req.auth!.studentId, parsed);
      res.json(progress);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/adaptive-diagnostics/:sessionId/state', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const state = await engine.getState(req.params.sessionId, req.auth!.studentId);
      res.json(state);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/adaptive-diagnostics/:sessionId/pause', async (req: AuthenticatedRequest, res: Response) => {
    try {
      await engine.pauseSession(req.params.sessionId, req.auth!.studentId);
      res.status(204).send();
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/adaptive-diagnostics/:sessionId/resume', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const state = await engine.resumeSession(req.params.sessionId, req.auth!.studentId);
      res.json({ sessionId: state.sessionId, status: state.status });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/adaptive-diagnostics/:sessionId/complete', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await engine.completeSession(req.params.sessionId, req.auth!.studentId);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/adaptive-diagnostics/:sessionId/result', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await engine.getResult(req.params.sessionId, req.auth!.studentId);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/adaptive-diagnostics/:sessionId/why/:skillId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const explanation = await engine.explainSkill(req.params.sessionId, req.auth!.studentId, req.params.skillId);
      res.json(explanation);
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof EngineError) {
    res.status(mapErrorCodeToStatus(err.code)).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid request body.', details: err.issues });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong.' });
}

function mapErrorCodeToStatus(code: string): number {
  switch (code) {
    case 'SESSION_NOT_FOUND':
    case 'QUESTION_NOT_FOUND':
    case 'SKILL_NOT_FOUND':
      return 404;
    case 'FORBIDDEN':
      return 403;
    case 'SESSION_NOT_ACTIVE':
    case 'INVALID_STATE_TRANSITION':
    case 'STALE_OR_MISMATCHED_QUESTION':
      return 409;
    default:
      return 400;
  }
}
