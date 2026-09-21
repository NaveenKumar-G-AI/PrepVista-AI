import express from 'express';
import cors from 'cors';
import { InMemoryRecallRepository } from './db/repository';
import { seedDemoData, DEMO_STUDENT_ID } from './db/seed';
import { RecallService } from './services/recallService';
import { buildRecallRoutes } from './routes/recallRoutes';
import { attachDemoLogging } from './events/eventBus';
import { isAiConfigured } from './ai/anthropicClient';

export function createApp() {
  const repo = new InMemoryRecallRepository();
  seedDemoData(repo);

  const service = new RecallService(repo);
  attachDemoLogging();

  const app = express();
  app.use(cors()); // dev-only: open CORS. Restrict this to the real frontend origin in production.
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      demoStudentId: DEMO_STUDENT_ID,
      aiConfigured: isAiConfigured(),
      note: 'AI explanations fall back to deterministic templates when ANTHROPIC_API_KEY is unset.',
    });
  });

  app.use('/api/recall', buildRecallRoutes(service));

  return app;
}
