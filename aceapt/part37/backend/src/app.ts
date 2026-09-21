import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { EvidenceIngestService } from './services/evidenceIngestService';
import { ReadinessService } from './services/readinessService';
import { buildReadinessRouter } from './routes/readinessRoutes';

/**
 * Mirrors how this is meant to be integrated for real: your existing
 * ACEAPT app almost certainly already sets up helmet/cors/body-parsing and
 * an auth middleware. This factory exists so Feature 37 can be run
 * standalone for local dev/demo purposes; when integrating for real, take
 * `buildReadinessRouter(...)` from routes/readinessRoutes.ts and mount it
 * on your existing app instead of adopting this whole file.
 */
export function createApp(readinessService: ReadinessService, evidenceIngestService: EvidenceIngestService): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ALLOWED_ORIGIN?.split(',') ?? [],
    })
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  app.use('/api/v1', buildReadinessRouter(readinessService, evidenceIngestService));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'No route matches this request.' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error('[feature-37] unhandled application error', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong.' });
  });

  return app;
}
