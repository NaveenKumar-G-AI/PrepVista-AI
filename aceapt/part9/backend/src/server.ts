import express from 'express';
import { buildRouter } from './api/routes';
import { errorHandler } from './api/errorHandler';
import { InMemorySimulationRepository } from './repositories/simulationRepository';
import { createDefaultIntegrations } from './integrations';

// ============================================================
// SERVER BOOTSTRAP
// ============================================================
// Swap InMemorySimulationRepository / createDefaultIntegrations() for
// real implementations here once this is wired into the actual ACEAPT
// backend - see INTEGRATION.md. Nothing else in the codebase needs to
// change; both are passed in by interface.

const app = express();
app.use(express.json());

// Minimal hand-rolled CORS for local dev (frontend on a different
// port). Replace with your platform's real CORS policy in production.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

const repo = new InMemorySimulationRepository();
const integrations = createDefaultIntegrations();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'aceapt-feature9-simulation-engine' });
});

app.use('/api', buildRouter(repo, integrations));

app.use(errorHandler);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ACEAPT Feature 9 - Simulation Engine listening on http://localhost:${PORT}`);
});

export { app };
