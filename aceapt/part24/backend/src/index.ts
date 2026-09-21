import 'dotenv/config';
import { createApp } from './server';
import { APP_CONFIG } from './config';

const app = createApp();

app.listen(APP_CONFIG.PORT, () => {
  console.log(`ACEAPT RECALL backend listening on http://localhost:${APP_CONFIG.PORT}`);
  console.log(`Demo mode: ${APP_CONFIG.DEMO_MODE}`);
  console.log(APP_CONFIG.ANTHROPIC_API_KEY ? 'Anthropic API key detected — AI explanations enabled.' : 'No ANTHROPIC_API_KEY set — using deterministic explanation templates.');
});
