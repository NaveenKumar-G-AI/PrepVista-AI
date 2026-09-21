import express from 'express';
import { getDb } from '../db/client';
import { requireAuth, requireRole, signToken, type AuthedRequest } from './auth';
import { evidenceRouter } from './routes/evidence';
import { managementRouter } from './routes/management';
import { roadmapRouter } from './routes/roadmap';
import { targetRouter } from './routes/target';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  getDb(); // touches the DB so /health also verifies connectivity
  res.json({ status: 'ok' });
});

/**
 * DEV-ONLY: stands in for a real identity provider (Supabase Auth / OAuth)
 * that would establish studentId from verified credentials, not from a
 * client-supplied field. Every route mounted below this only ever reads
 * studentId from the verified token — see src/api/auth.ts and docs/SECURITY.md.
 */
app.post('/auth/dev-login', express.json(), (req, res) => {
  const { studentId, role } = req.body as { studentId?: string; role?: 'STUDENT' | 'TPO_ADMIN' };
  if (!studentId) return res.status(422).json({ error: 'studentId required' });
  const db = getDb();
  const student = db.prepare(`SELECT id FROM students WHERE id = ?`).get(studentId);
  if (!student) return res.status(404).json({ error: 'unknown studentId' });
  res.json({ token: signToken(studentId, role ?? 'STUDENT') });
});

app.use('/students/me/target', requireAuth, targetRouter);
app.use('/roadmap', requireAuth, roadmapRouter);
app.use('/evidence', requireAuth, evidenceRouter);
app.use('/management', requireAuth, requireRole('TPO_ADMIN'), managementRouter);

app.use((req: AuthedRequest, res) => {
  res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.PORT || 4000);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`CodeForge Roadmap Engine listening on :${port}`);
  });
}

export { app };
