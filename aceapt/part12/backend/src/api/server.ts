import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { router } from './routes';

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'aceapt-feature12' }));
  app.use('/api', router);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
