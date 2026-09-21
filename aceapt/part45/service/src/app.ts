import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { attachUser } from './api/middleware/auth.middleware';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler';
import { skillGraphRouter } from './api/routes/skillGraph.routes';
import { studentGraphRouter } from './api/routes/studentGraph.routes';
import { adminGraphRouter } from './api/routes/adminGraph.routes';
import { institutionGraphRouter } from './api/routes/institutionGraph.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(attachUser);

  app.get('/health', (_req, res) => res.json({ ok: true, feature: 'aceapt-feature-45-skill-graph' }));

  app.use('/api/skill-graph', skillGraphRouter);
  app.use('/api/admin/skill-graph', adminGraphRouter);
  app.use('/api/students', studentGraphRouter);
  app.use('/api/institutions', institutionGraphRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
