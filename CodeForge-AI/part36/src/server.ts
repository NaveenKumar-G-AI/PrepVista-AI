import { createApp } from './app';
import { env, assertProductionSecrets } from './config/env';
import { logger } from './utils/logger';
import { registerAggregationWorker } from './events/handlers';

assertProductionSecrets();

const app = createApp();

// In single-process/dev mode, the API process also runs the
// aggregation worker in-line. Run `npm run worker:dev` as a separate
// process instead once QUEUE_PROVIDER=bullmq is enabled — see
// src/worker.ts.
if (env.QUEUE_PROVIDER === 'memory') {
  registerAggregationWorker();
}

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, databaseProvider: env.DATABASE_PROVIDER, queueProvider: env.QUEUE_PROVIDER },
    'CodeForge Cohort Intelligence API listening.'
  );
});
