import express from 'express';
import { MemoryRepository } from '../db/memoryRepository.js';
import { createEngine } from '../services/index.js';
import { buildRoutes } from './routes.js';
import { demoAuth, errorHandler } from './middleware.js';

const repo = new MemoryRepository();
const engine = createEngine(repo);

const app = express();
app.use(express.json());
// Dev-only CORS so admin-console/index.html (opened as a separate static origin, e.g. file://
// or a lightweight static server) can call this API on localhost. Tighten or remove this before
// any real deployment — see README "Security".
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-demo-role, x-demo-tenant, x-demo-actor');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(demoAuth);
app.use('/api', buildRoutes(engine));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(errorHandler);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Question Quality Engine API listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log('Storage: in-memory (swap MemoryRepository for a real adapter — see src/db/repository.ts)');
});

export { app, engine };
