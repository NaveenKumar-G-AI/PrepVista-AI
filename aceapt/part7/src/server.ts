import { createApp } from './app';
import { env, usingMockFeature5, usingMockFeature6, usingAiExplanations } from './config/env';
import { seedAll } from './db/seed';

seedAll(); // idempotent — safe to call on every boot

const app = createApp();
app.listen(env.port, () => {
  console.log(`Feature 7 API listening on http://localhost:${env.port}`);
  console.log(`  Feature 5 integration : ${usingMockFeature5 ? 'mock (FEATURE5_API_URL not set)' : 'live'}`);
  console.log(`  Feature 6 integration : ${usingMockFeature6 ? 'mock (FEATURE6_API_URL not set)' : 'live'}`);
  console.log(`  AI explanations       : ${usingAiExplanations ? 'enabled' : 'template fallback (ANTHROPIC_API_KEY not set)'}`);
});
