import express, { type Express } from 'express';
import cors from 'cors';
import type { ContextSourceRepository, StrategyStore } from './repositories/types.js';
import type { InMemoryContextSourceRepository } from './repositories/inMemoryRepository.js';
import type { LLMProvider } from './ai/llmProvider.js';
import { strategyRoutes } from './routes/strategyRoutes.js';
import { decisionsAndActionsRoutes } from './routes/decisionsAndActions.js';
import { experimentsAndFeedbackRoutes } from './routes/experimentsAndFeedback.js';
import { errorHandler } from './middleware/index.js';

export interface AppDependencies {
  sources: ContextSourceRepository & Partial<InMemoryContextSourceRepository>;
  store: StrategyStore;
  llm: LLMProvider;
}

/**
 * Builds the Feature 41 Express router mounted under /api/feature41.
 *
 * This is written as a standalone app (with its own cors/json middleware)
 * ONLY so it's runnable and testable in isolation without the rest of
 * ACEAPT. To integrate for real: take the Router returned by the route
 * factories (strategyRoutes/decisionsAndActionsRoutes/
 * experimentsAndFeedbackRoutes) and app.use() them directly on ACEAPT's
 * existing Express app instead of standing up a second server — and replace
 * devAuth in middleware/index.ts with ACEAPT's real auth middleware first.
 */
export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  const decisionsSource = deps.sources as InMemoryContextSourceRepository;
  app.use('/api/feature41', strategyRoutes(deps.sources, deps.store, deps.llm));
  app.use('/api/feature41', decisionsAndActionsRoutes(decisionsSource, deps.store));
  app.use('/api/feature41', experimentsAndFeedbackRoutes(deps.store));

  app.use(errorHandler);
  return app;
}
