import express from 'express';
import { buildFeature10Router } from './api/routes';
import { InMemoryForecastRepository } from './repositories/forecastRepository';
import { DemoAdapter } from './integrations/demoAdapter';

/**
 * Standalone runnable entry point for LOCAL TESTING ONLY.
 *
 * In the real ACEAPT backend, import `buildFeature10Router` and mount it
 * on your existing Express app instead of running this file - see
 * README "Integrating into ACEAPT". This file exists so `npm run dev`
 * gives you something to curl while you build the real adapters.
 */
const app = express();
app.use(express.json());

const repo = new InMemoryForecastRepository();
const adapters = new DemoAdapter(); // swap for real Feature 3/5/6/7/8/9 adapters

app.use('/api/feature10', buildFeature10Router(adapters, repo));

const port = process.env.PORT ? Number(process.env.PORT) : 4010;
app.listen(port, () => {
  console.log(`Feature 10 demo server listening on :${port} (DEMO adapters - not real student data)`);
  console.log(`Try: curl -H "x-student-id: demo_student" http://localhost:${port}/api/feature10/forecasts/current`);
});
