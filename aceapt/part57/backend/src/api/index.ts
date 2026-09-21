import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authenticate } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { shortcutsRouter } from './routes/shortcuts';
import { trainingRouter } from './routes/training';
import { recommendationsRouter } from './routes/recommendations';
import { usageRouter } from './routes/usage';
import { discoveriesRouter } from './routes/discoveries';
import { adminRouter } from './routes/admin';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', feature: 57, name: 'Personal Shortcut Library' });
  });

  // Every route below this line requires authentication (sec. 231-233,
  // security/tenant isolation). Tenant + student scoping happens inside each
  // route handler via req.auth, never from a client-supplied studentId,
  // except in the /admin routes which are role-gated separately.
  app.use('/api', authenticate);
  app.use('/api/shortcuts', shortcutsRouter);
  app.use('/api/training', trainingRouter);
  app.use('/api/recommendations', recommendationsRouter);
  app.use('/api/usage', usageRouter);
  app.use('/api/discoveries', discoveriesRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
