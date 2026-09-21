import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { router as feature7Router } from './routes/feature7.routes';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', feature: 'Feature 7 — Readiness Coaching & Action Engine' })
  );

  app.use('/api', feature7Router);

  app.use((req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  });

  // Centralized error handler — every asyncHandler-wrapped route lands here
  // on failure instead of crashing the process.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[error]', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}
