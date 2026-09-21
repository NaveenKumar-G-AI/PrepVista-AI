import express, { NextFunction, Request, Response } from 'express';
import { alignRouter, proofWebhookRouter, tpoRouter } from './api/routes/align.routes';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'aceapt-feature29-align' }));

  app.use('/align/tpo', tpoRouter);
  app.use('/align', proofWebhookRouter);
  app.use('/align', alignRouter);

  // Centralized error handler — keeps controllers free of try/catch
  // boilerplate for anything that isn't a deliberate 4xx.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[unhandled]', err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
