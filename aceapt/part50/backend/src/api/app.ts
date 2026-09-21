import express, { Express } from 'express';
import { env, hasAiCoaching, hasDatabase, hasJwtSecret } from '../config/env';
import { getDb } from '../db/client';
import { createDrizzleSpeedRepository } from '../db/repositories/drizzle';
import { createInMemorySpeedRepository } from '../db/repositories/inMemory';
import { SpeedRepository } from '../db/repositories/types';
import { defaultIntegrationProviders } from '../integrations/defaultProviders';
import { IntegrationProviders } from '../integrations/types';
import { createAiCoachingService } from '../services/aiCoachingService';
import { createSpeedAnalyticsService } from '../services/speedAnalyticsService';
import { createSpeedSessionService } from '../services/speedSessionService';
import { authMiddleware, errorHandler } from './middleware';
import { createSpeedRoutes } from './routes';

export interface CreateAppOptions {
  repo?: SpeedRepository;
  providers?: IntegrationProviders;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const repo =
    options.repo ??
    (hasDatabase
      ? createDrizzleSpeedRepository(getDb())
      : (() => {
          // eslint-disable-next-line no-console
          console.warn('[feature-50] No DATABASE_URL configured - starting with in-memory storage. Data will not persist.');
          return createInMemorySpeedRepository();
        })());

  const providers = options.providers ?? defaultIntegrationProviders;

  if (!hasJwtSecret) {
    // eslint-disable-next-line no-console
    console.warn('[feature-50] No JWT_SECRET configured - all requests will be rejected until it is set.');
  }

  const aiCoaching = createAiCoachingService({
    apiKey: env.anthropicApiKey,
    model: env.aiCoachingModel,
    enabled: hasAiCoaching,
  });

  const sessionService = createSpeedSessionService({ repo, providers, aiCoaching });
  const analyticsService = createSpeedAnalyticsService({ repo, providers });

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', storage: hasDatabase ? 'postgres' : 'in-memory', aiCoaching: hasAiCoaching });
  });

  app.use('/api/speed', authMiddleware(env.jwtSecret), createSpeedRoutes({ sessionService, analyticsService }));

  app.use(errorHandler);

  return app;
}
