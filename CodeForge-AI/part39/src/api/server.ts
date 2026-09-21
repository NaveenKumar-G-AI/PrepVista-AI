import cors from 'cors';
import express, { Express } from 'express';
import path from 'path';
import { usingInMemoryCacheAndLimiters, usingInMemoryPersistence } from '../config';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { idempotency } from './middleware/idempotency';
import routes from './routes/index';

export function createServer(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // Unauthenticated — used by uptime checks and by the dashboard to know
  // whether it's pointed at a live gateway at all.
  app.get('/healthz', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'codeforge-ai-controls',
      persistence: usingInMemoryPersistence ? 'in-memory (set DATABASE_URL for Postgres)' : 'postgres',
      cacheAndLimiters: usingInMemoryCacheAndLimiters ? 'in-memory (set REDIS_URL for multi-instance)' : 'redis',
      time: new Date().toISOString(),
    });
  });

  app.use('/api', authMiddleware, idempotency, routes);

  // The dashboard is a plain static file (no templating, no server-side
  // rendering) — it authenticates and fetches data from /api itself, the
  // same way an externally-hosted copy of this file would. Serving it
  // here is a convenience for local dev, not a requirement; you can just
  // as easily open dashboard/index.html directly or host it separately.
  app.use('/dashboard', express.static(path.join(__dirname, '..', '..', 'dashboard')));

  app.use(errorHandler);

  return app;
}
