// Composition root. Wires the real Postgres repository to the demo/dev
// adapters. Replace the adapters with real ones as Feature 26, Feature 27,
// the capability model, and real auth become reachable — see
// src/domain/ports.ts and TRUTH_TABLE.md. Nothing else needs to change.

import { createPool } from './db/pool.js';
import { PostgresProofRepository } from './repositories/postgresProofRepository.js';
import { ProofService } from './services/proofService.js';
import { buildServer } from './api/server.js';
import { GroqExplanationAdapter } from './adapters/groqExplanationAdapter.js';
import {
  DemoForecastAdapter, DemoAdaptAdapter, DemoCapabilityAdapter, HeuristicNoveltyAdapter, DevAuthAdapter,
} from './adapters/demoAdapters.js';

const pool = createPool();
const repo = new PostgresProofRepository(pool);
const service = new ProofService(
  repo,
  new DemoForecastAdapter(new Map()),
  new DemoAdaptAdapter(),
  new DemoCapabilityAdapter(new Map()),
  new HeuristicNoveltyAdapter(),
  new GroqExplanationAdapter(),
);

const app = buildServer(service, new DevAuthAdapter());

const port = Number(process.env.PROOF_PORT ?? 4028);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`ACEAPT PROOF API listening on :${port}`);
});
