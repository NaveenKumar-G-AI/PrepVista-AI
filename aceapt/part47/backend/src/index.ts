import { env, warnOnInsecureDefaults } from './config/env.js';
import { createApp } from './app.js';

warnOnInsecureDefaults();
const app = createApp();

app.listen(env.port, () => {
  console.log(`[aceapt-feature-47] Guided Solving Engine listening on http://localhost:${env.port}`);
  console.log(`[aceapt-feature-47] Health check: http://localhost:${env.port}/health`);
  if (env.enableDevRoutes) {
    console.log(`[aceapt-feature-47] Dev-only token route enabled: POST /api/dev/token { "studentId": "..." }`);
  }
});
