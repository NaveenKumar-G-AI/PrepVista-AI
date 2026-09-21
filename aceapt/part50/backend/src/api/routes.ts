import { Router } from 'express';
import { AttemptDecision, PressureLevel, ScopeKey, TrainingMode } from '../types/domain';
import { SpeedSessionService } from '../services/speedSessionService';
import { SpeedAnalyticsService } from '../services/speedAnalyticsService';
import { AuthedRequest, requireRole } from './middleware';
import {
  cohortQuerySchema,
  startPacingSessionSchema,
  startPlacementSimulationSchema,
  startSessionSchema,
  submitAttemptSchema,
} from './validation';

function parseScopeFromQuery(req: AuthedRequest): ScopeKey {
  const scopeType = String(req.query.scopeType ?? 'OVERALL');
  const scopeId = String(req.query.scopeId ?? 'overall');
  return { scopeType: scopeType as ScopeKey['scopeType'], scopeId };
}

export function createSpeedRoutes(deps: { sessionService: SpeedSessionService; analyticsService: SpeedAnalyticsService }): Router {
  const { sessionService, analyticsService } = deps;
  const router = Router();

  // startSpeedSession
  router.post('/sessions', async (req: AuthedRequest, res, next) => {
    try {
      const parsed = startSessionSchema.parse(req.body);
      const input = {
        ...parsed,
        mode: parsed.mode as TrainingMode,
        requestedPressure: parsed.requestedPressure as PressureLevel | undefined,
      };
      const session = await sessionService.startSpeedSession(req.auth!.studentId, input);
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  // getSpeedSession
  router.get('/sessions/:sessionId', async (req: AuthedRequest, res, next) => {
    try {
      const session = await sessionService.getSpeedSession(req.auth!.studentId, req.params.sessionId);
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // submitSpeedAttempt
  router.post('/sessions/:sessionId/attempts', async (req: AuthedRequest, res, next) => {
    try {
      const parsed = submitAttemptSchema.parse(req.body);
      const input = { ...parsed, decision: parsed.decision as AttemptDecision | undefined };
      const result = await sessionService.submitSpeedAttempt(req.auth!.studentId, req.params.sessionId, input);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // completeSpeedSession
  router.post('/sessions/:sessionId/complete', async (req: AuthedRequest, res, next) => {
    try {
      const result = await sessionService.completeSpeedSession(req.auth!.studentId, req.params.sessionId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // getSpeedProfile
  router.get('/profile', async (req: AuthedRequest, res, next) => {
    try {
      const scope = parseScopeFromQuery(req);
      const profile = await analyticsService.getSpeedProfile(req.auth!.studentId, scope);
      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  // getSpeedBottlenecks
  router.get('/bottlenecks', async (req: AuthedRequest, res, next) => {
    try {
      const scope = parseScopeFromQuery(req);
      const result = await analyticsService.getSpeedBottlenecks(req.auth!.studentId, scope);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // getSpeedTargets
  router.get('/targets', async (req: AuthedRequest, res, next) => {
    try {
      const scope = parseScopeFromQuery(req);
      const target = await analyticsService.getSpeedTargets(req.auth!.studentId, scope);
      res.json(target);
    } catch (err) {
      next(err);
    }
  });

  // getSpeedFrontier (spec 110-111): accuracy-vs-speed frontier + safe zone
  router.get('/frontier', async (req: AuthedRequest, res, next) => {
    try {
      const scope = parseScopeFromQuery(req);
      const result = await analyticsService.getSpeedFrontier(req.auth!.studentId, scope);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // startPlacementSimulation
  router.post('/placement-simulations', async (req: AuthedRequest, res, next) => {
    try {
      const input = startPlacementSimulationSchema.parse(req.body);
      const session = await analyticsService.startPlacementSimulation(req.auth!.studentId, input);
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  // Pacing mode (spec 39) uses the same pacing-session machinery as placement simulation.
  router.post('/pacing-sessions', async (req: AuthedRequest, res, next) => {
    try {
      const input = startPacingSessionSchema.parse(req.body);
      const session = await analyticsService.startPacingSession(req.auth!.studentId, input);
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  // getPacingSummary
  router.get('/pacing/:pacingSessionId', async (req: AuthedRequest, res, next) => {
    try {
      const summary = await analyticsService.getPacingSummary(req.auth!.studentId, req.params.pacingSessionId);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  // Authorized trainer/TPO cohort view (spec 106-107) - aggregate only.
  router.post('/cohort/:cohortId/bottlenecks', requireRole('TRAINER', 'TPO'), async (req: AuthedRequest, res, next) => {
    try {
      const { studentIds } = cohortQuerySchema.parse(req.body);
      const distribution = await analyticsService.getCohortBottleneckDistribution(req.auth!.studentId, req.params.cohortId, studentIds);
      res.json(distribution);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
