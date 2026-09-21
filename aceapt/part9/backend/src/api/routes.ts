import { Router } from 'express';
import { z } from 'zod';
import { authenticate, issueDevToken } from '../middleware/auth';
import { asyncHandler } from './asyncHandler';
import { SimulationEngine } from '../services/simulationEngine';
import { BlueprintService } from '../services/blueprintService';
import { SimulationRepository } from '../repositories/simulationRepository';
import { Integrations } from '../integrations';

// ============================================================
// API ROUTES  (spec section 49)
// ============================================================
// Mirrors the spec's conceptual route list. One addition beyond the
// literal list: POST /simulations/:id/goto, a small navigation
// convenience for the "skip and return later" UI described in section
// 56 - flagged here rather than hidden. All routes below sit under
// whatever prefix server.ts mounts this router at (default: /api).

const startSchema = z.object({
  blueprintId: z.string().min(1),
  pressureMode: z.enum(['NORMAL', 'COMPETITIVE', 'STRICT', 'HIGH_PRESSURE']).optional(),
});
const eventSchema = z.object({
  questionId: z.string().min(1),
  type: z.enum(['OPEN', 'TIME_WARNING']),
});
const answerSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
});
const questionIdSchema = z.object({ questionId: z.string().min(1) });
const gotoSchema = z.object({ index: z.number().int().min(0) });

export function buildRouter(repo: SimulationRepository, integrations: Integrations): Router {
  const router = Router();
  const engine = new SimulationEngine(repo, integrations);
  const blueprints = new BlueprintService();

  // Dev-only convenience so this API is runnable without wiring real
  // ACEAPT auth first. Disabled outside development - see auth.ts.
  router.post('/dev/token', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Not available in production.' });
      return;
    }
    const studentId = typeof req.body?.studentId === 'string' ? req.body.studentId : 'demo-student-1';
    res.json({ token: issueDevToken(studentId), studentId });
  });

  router.get('/blueprints', (_req, res) => {
    res.json({ blueprints: blueprints.list() });
  });

  router.use(authenticate);

  router.get(
    '/simulations',
    asyncHandler(async (req, res) => {
      const history = await engine.listHistory(req.studentId!);
      res.json({ simulations: history });
    }),
  );

  router.get(
    '/simulations/history',
    asyncHandler(async (req, res) => {
      const history = await engine.listHistory(req.studentId!);
      res.json({ history });
    }),
  );

  router.post(
    '/simulations/start',
    asyncHandler(async (req, res) => {
      const body = startSchema.parse(req.body);
      const result = await engine.start(req.studentId!, body.blueprintId, body.pressureMode);
      res.status(201).json(result);
    }),
  );

  router.get(
    '/simulations/:id',
    asyncHandler(async (req, res) => {
      const simulation = await engine.getSimulation(req.studentId!, req.params.id);
      res.json({ simulation });
    }),
  );

  router.get(
    '/simulations/:id/questions/:sequence',
    asyncHandler(async (req, res) => {
      const sequence = Number(req.params.sequence);
      const question = await engine.getQuestionAt(req.studentId!, req.params.id, sequence);
      res.json({ question });
    }),
  );

  router.post(
    '/simulations/:id/events',
    asyncHandler(async (req, res) => {
      const body = eventSchema.parse(req.body);
      if (body.type === 'OPEN') {
        await engine.recordOpenEvent(req.studentId!, req.params.id, body.questionId);
      }
      res.status(202).json({ recorded: true });
    }),
  );

  router.post(
    '/simulations/:id/answer',
    asyncHandler(async (req, res) => {
      const body = answerSchema.parse(req.body);
      const result = await engine.answer(req.studentId!, req.params.id, body.questionId, body.optionId);
      res.json(result);
    }),
  );

  router.post(
    '/simulations/:id/skip',
    asyncHandler(async (req, res) => {
      const body = questionIdSchema.parse(req.body);
      const result = await engine.skip(req.studentId!, req.params.id, body.questionId);
      res.json(result);
    }),
  );

  router.post(
    '/simulations/:id/return',
    asyncHandler(async (req, res) => {
      const body = questionIdSchema.parse(req.body);
      const result = await engine.returnTo(req.studentId!, req.params.id, body.questionId);
      res.json(result);
    }),
  );

  router.post(
    '/simulations/:id/goto',
    asyncHandler(async (req, res) => {
      const body = gotoSchema.parse(req.body);
      const result = await engine.goto(req.studentId!, req.params.id, body.index);
      res.json(result);
    }),
  );

  router.post(
    '/simulations/:id/complete',
    asyncHandler(async (req, res) => {
      const report = await engine.complete(req.studentId!, req.params.id);
      res.json({ report });
    }),
  );

  router.get(
    '/simulations/:id/result',
    asyncHandler(async (req, res) => {
      const report = await engine.getReport(req.studentId!, req.params.id);
      res.json({
        result: {
          simulationId: report.simulationId,
          overallScore: report.overallScore,
          dimensions: report.dimensions,
          correctCount: report.correctCount,
          wrongCount: report.wrongCount,
          skippedCount: report.skippedCount,
        },
      });
    }),
  );

  router.get(
    '/simulations/:id/report',
    asyncHandler(async (req, res) => {
      const report = await engine.getReport(req.studentId!, req.params.id);
      res.json({ report });
    }),
  );

  return router;
}
