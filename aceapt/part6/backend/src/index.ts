import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { getDb } from './db/db';
import { seed } from './db/seed';
import { stubAuth } from './middleware/auth';
import { apiRateLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { assessmentsRouter } from './routes/assessments';
import { practiceRouter } from './routes/practice';
import { log } from './utils/logger';

// Ensure the DB exists and is migrated + seeded before the server starts accepting traffic.
getDb();
seed();

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());
app.use(apiRateLimiter);
app.use(stubAuth);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'aceapt-feature6-backend', time: new Date().toISOString() });
});

app.use('/api/assessments', assessmentsRouter);
app.use('/api/practice-sessions', practiceRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  log(`ACEAPT Feature 6 backend listening on http://localhost:${env.port}`);
  log(`Try: curl http://localhost:${env.port}/health`);
});
