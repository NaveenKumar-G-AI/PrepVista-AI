import express from 'express';
import cors from 'cors';
import { ENV } from './config/env';
import { router } from './api/routes';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler';
import { loadDemoData } from './demo/seedEvents';

async function main(): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  if (ENV.DEMO_MODE) {
    const count = await loadDemoData();
    console.log(`[demo] Loaded ${count} synthetic demo events (DEMO_MODE=true). See src/demo/seedEvents.ts.`);
  }

  app.listen(ENV.PORT, () => {
    console.log(`ACEAPT Feature 11 - Behavior Intelligence listening on http://localhost:${ENV.PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
