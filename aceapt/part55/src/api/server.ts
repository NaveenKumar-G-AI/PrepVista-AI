import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { buildDifficultyRouter } from './difficulty.routes.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/difficulty', buildDifficultyRouter());

  // Centralized error handler — keeps internal error detail out of the
  // response (§155 security) while still logging server-side.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    if (err instanceof Error && err.name === 'ZodError') {
      res.status(400).json({ error: 'Invalid request', detail: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}

if (process.env.VITEST !== 'true') {
  const app = createApp();
  const port = Number(process.env.PORT ?? 4055);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Feature 55 (Difficulty Calibration Engine) listening on :${port}`);
  });
}
