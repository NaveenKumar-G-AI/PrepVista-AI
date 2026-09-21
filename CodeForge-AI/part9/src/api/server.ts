import express from 'express';
import { requireAuth } from './middleware/auth.js';
import skillsRouter from './routes/skills.js';
import practiceRouter from './routes/practice.js';
import recommendationsRouter from './routes/recommendations.js';

/**
 * Standalone dev server. When integrating into your real CodeForge app,
 * mount these three routers on your existing Express/Next.js app instead
 * of running this file — see docs/INTEGRATION_GUIDE.md.
 */
export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/skills', requireAuth, skillsRouter);
  app.use('/practice', requireAuth, practiceRouter);
  app.use('/recommendations', requireAuth, recommendationsRouter);

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  createApp().listen(port, () => {
    console.log(`codeforge-mastery-engine listening on :${port}`);
  });
}
