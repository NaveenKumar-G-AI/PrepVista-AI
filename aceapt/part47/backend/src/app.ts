import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { InMemoryProblemBank } from './domain/problemBank/index.js';
import { FileGuidedSessionRepository } from './repositories/guidedSessionRepository.js';
import { FileGuidedStepStateRepository } from './repositories/guidedStepStateRepository.js';
import { FileGuidedAttemptRepository } from './repositories/guidedAttemptRepository.js';
import { FileGuidedAssistanceRepository } from './repositories/guidedAssistanceRepository.js';
import { FileGuidedOutcomeRepository } from './repositories/guidedOutcomeRepository.js';
import { ConsoleAnalyticsSink } from './domain/integrations/analytics.js';
import { LoggingMistakeIntelligencePort } from './domain/integrations/mistakeIntelligence.js';
import { LoggingMasteryPort } from './domain/integrations/mastery.js';
import { GuidedSolvingService, type GuidedSolvingServiceDeps } from './services/guidedSolvingService.js';
import { buildGuidedSessionRouter } from './api/routes/guidedSession.routes.js';
import { buildDevRouter } from './api/routes/dev.routes.js';
import { errorHandler } from './api/middleware/errorHandler.js';

/**
 * Composition root (Section 121's "reusable components" made concrete).
 * Every dependency here is an INTERFACE from src/repositories or
 * src/domain/integrations - swapping the JSON-file store for Postgres, or
 * these logging stubs for ACEAPT's real Mistake Intelligence / Mastery
 * services, means editing only this function.
 */
export function createGuidedSolvingService(): GuidedSolvingService {
  const deps: GuidedSolvingServiceDeps = {
    problemBank: new InMemoryProblemBank(),
    sessions: new FileGuidedSessionRepository(),
    stepStates: new FileGuidedStepStateRepository(),
    attempts: new FileGuidedAttemptRepository(),
    assistance: new FileGuidedAssistanceRepository(),
    outcomes: new FileGuidedOutcomeRepository(),
    analytics: new ConsoleAnalyticsSink(),
    mistakeIntelligence: new LoggingMistakeIntelligencePort(),
    mastery: new LoggingMasteryPort(),
  };
  return new GuidedSolvingService(deps);
}

export function createApp(service: GuidedSolvingService = createGuidedSolvingService()): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'aceapt-feature-47-guided-solving' }));

  if (env.enableDevRoutes) {
    app.use('/api', buildDevRouter());
  }
  app.use('/api/guided', buildGuidedSessionRouter(service));

  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'No such route.' }));
  app.use(errorHandler);

  return app;
}
