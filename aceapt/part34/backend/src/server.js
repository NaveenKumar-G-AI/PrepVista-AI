import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { router as careerRouter } from './routes/career.js';
import { demoAuth, errorHandler } from './middleware.js';
import { seed, DEMO_STUDENT_ID } from './db/seed.js';
import { getStudent } from './db/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data.json');

// Seed demo data only if it isn't already there, so restarting the server
// doesn't wipe out anything explored in the running app (an intervention
// started, a result logged, a target change, etc).
if (!fs.existsSync(DATA_FILE) || !getStudent(DEMO_STUDENT_ID)) {
  seed();
}

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/career', demoAuth, careerRouter);
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  if (!process.env.DEMO_AUTH_TOKEN) {
    console.warn('[server] DEMO_AUTH_TOKEN is not set - running in open dev mode. Do not deploy like this.');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[server] ANTHROPIC_API_KEY is not set - the AI narrative endpoint will use deterministic fallback text.');
  }
  console.log(`[server] Feature 34 API listening on http://localhost:${port}`);
});
