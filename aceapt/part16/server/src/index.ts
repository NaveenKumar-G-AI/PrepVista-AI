import fs from 'node:fs';
import path from 'node:path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { requireStudentAuth } from './middleware/auth';
import { attemptsRouter } from './routes/attempts';
import { interventionsRouter } from './routes/interventions';
import { stuckRouter } from './routes/stuck';
import { recoveryRouter } from './routes/recovery';
import { historyRouter, profileRouter, journeyRouter } from './routes/historyAndProfile';
import { questionsRouter, examSimulationRouter } from './routes/questions';
import { demoRouter } from './routes/demo';
import { isLlmConfigured } from './config';

const app = express();
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, llmConfigured: isLlmConfigured() });
});

// Demo bootstrap route has no auth — everything else does.
app.use('/api/demo', demoRouter);

app.use('/api/attempts', requireStudentAuth, attemptsRouter);
app.use('/api/interventions', requireStudentAuth, interventionsRouter);
app.use('/api/stuck', requireStudentAuth, stuckRouter);
app.use('/api/recovery-sessions', requireStudentAuth, recoveryRouter);
app.use('/api/students', requireStudentAuth, historyRouter);
app.use('/api/students', requireStudentAuth, profileRouter);
app.use('/api/students', requireStudentAuth, journeyRouter);
app.use('/api/questions', requireStudentAuth, questionsRouter);
app.use('/api/exam-simulation', requireStudentAuth, examSimulationRouter);

// In production, serve the built client if it exists alongside this server.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal error.' });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ACEAPT Feature 16 server listening on http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`LLM configured: ${isLlmConfigured()} (set ANTHROPIC_API_KEY in server/.env to enable)`);
  if (!fs.existsSync(clientDist)) {
    // eslint-disable-next-line no-console
    console.log('Client build not found — run `npm run build` in /client, or `npm run dev` there for the dev server.');
  }
});
