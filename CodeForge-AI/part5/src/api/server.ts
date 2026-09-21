import express from 'express';
import type { DB } from '../db/client.js';
import type { AIProvider } from '../ai/types.js';
import { authRouter } from './routes/auth.js';
import { attemptsRouter } from './routes/attempts.js';
import { dashboardRouter } from './routes/dashboard.js';
import { recommendationsRouter } from './routes/recommendations.js';
import { practiceRouter } from './routes/practice.js';
import { challengesRouter } from './routes/challenges.js';
import { historyRouter } from './routes/history.js';

export function createServer(db: DB, ai: AIProvider) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter(db));
  app.use('/api/attempts', attemptsRouter(db));
  app.use('/api/dashboard', dashboardRouter(db, ai));
  app.use('/api/recommendations', recommendationsRouter(db, ai));
  app.use('/api/practice', practiceRouter(db));
  app.use('/api/challenges', challengesRouter(db));
  app.use('/api/history', historyRouter(db));

  // Never leak stack traces / internals to the client.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
