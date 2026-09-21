import express from 'express';
import * as path from 'path';
import { stubAuth, errorHandler } from './middleware/auth';
import { assessmentsRouter } from './routes/assessments';

export function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  // Static frontend (open http://localhost:PORT/ ) — served from the same
  // origin as /api so the browser client needs no CORS configuration.
  app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));
  app.use('/api', stubAuth, assessmentsRouter);
  app.use(errorHandler);
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4000);
  createServer().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`CodeForge Assessment Engine API listening on :${port}`);
  });
}
