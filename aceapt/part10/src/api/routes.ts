import { Router, Request, Response } from 'express';
import { generateForecast } from '../engines/forecastEngine';
import { explainForecast } from '../ai/explanationService';
import { buildExplanationInput } from '../ai/explanationInput';
import { ForecastRepository } from '../repositories/forecastRepository';
import { Adapters } from '../integrations/adapters';
import { requireAuthenticatedStudent } from './middleware/auth';
import { Forecast } from '../types';

/**
 * SS57 API Concept. Endpoint shapes follow the spec's conceptual list;
 * adjust the mount prefix to match ACEAPT's existing router conventions
 * (see README "Integrating into ACEAPT" for how to mount this).
 */
export function buildFeature10Router(adapters: Adapters, repo: ForecastRepository): Router {
  const router = Router();
  router.use(requireAuthenticatedStudent);

  router.get('/forecasts/current', async (req: Request, res: Response) => {
    const studentId = req.studentId!;
    let forecast = await repo.getCurrent(studentId);
    if (!forecast) forecast = await recomputeAndStore(studentId, adapters, repo);
    res.json(forecast);
  });

  router.post('/forecasts/recompute', async (req: Request, res: Response) => {
    const forecast = await recomputeAndStore(req.studentId!, adapters, repo);
    res.json(forecast);
  });

  router.get('/forecasts/history', async (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(await repo.getHistory(req.studentId!, limit));
  });

  router.get('/forecasts/:id', async (req: Request, res: Response) => {
    const forecast = await repo.getById(req.params.id);
    if (!forecast || forecast.studentId !== req.studentId) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(forecast);
  });

  router.get('/readiness/trajectory', async (req: Request, res: Response) => {
    const forecast = await repo.getCurrent(req.studentId!);
    res.json({ trajectory: forecast?.trajectory ?? 'INSUFFICIENT_EVIDENCE', dataWindow: forecast?.dataWindow ?? null });
  });

  router.get('/readiness/risks', async (req: Request, res: Response) => {
    const forecast = await repo.getCurrent(req.studentId!);
    res.json(forecast?.risks ?? []);
  });

  router.get('/readiness/bottlenecks', async (req: Request, res: Response) => {
    const forecast = await repo.getCurrent(req.studentId!);
    res.json(forecast?.bottlenecks ?? { primary: null, secondary: null, ranked: [], chain: [] });
  });

  router.get('/readiness/explanation', async (req: Request, res: Response) => {
    const forecast = await repo.getCurrent(req.studentId!);
    if (!forecast) {
      res.status(404).json({ error: 'No forecast yet' });
      return;
    }
    if (!forecast.explanation) {
      forecast.explanation = await explainForecast(buildExplanationInput(forecast));
      await repo.save(forecast);
    }
    res.json({ explanation: forecast.explanation });
  });

  router.post('/targets', async (_req: Request, res: Response) => {
    // SS46 Target Management - delegate persistence to your existing target
    // storage (or Feature 6) once wired; stubbed here for the demo.
    res.status(501).json({ error: 'Wire this endpoint to your target storage before use.' });
  });

  router.get('/targets/current', async (_req: Request, res: Response) => {
    res.status(501).json({ error: 'Wire this endpoint to your target storage before use.' });
  });

  return router;
}

async function recomputeAndStore(studentId: string, adapters: Adapters, repo: ForecastRepository): Promise<Forecast> {
  const bundle = await adapters.buildEvidenceBundle(studentId);
  const forecast = generateForecast(bundle);
  if (forecast.status === 'GENERATED') {
    forecast.explanation = await explainForecast(buildExplanationInput(forecast, bundle.target?.targetScore ?? null));
  }
  try {
    await adapters.pushSignals(studentId, forecast); // SS28 Feature 7 Integration
  } catch (err) {
    console.error('Failed to push signals to Feature 7 (non-fatal):', err);
  }
  await adapters.recordLongTermEvidence(studentId, forecast); // SS33 Feature 3 Integration
  return repo.save(forecast);
}
