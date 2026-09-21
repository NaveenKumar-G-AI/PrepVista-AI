// ============================================================================
// Composition root.
//
// >>> SWAP POINT <<<
// The InMemory* repositories and Mock*Port classes below are the default,
// zero-config wiring for this prototype. Replace them with real
// implementations once the actual ACEAPT database and Features 13/14/16/17/18
// clients are available:
//   - InMemoryKnowledgeStateRepository, InMemoryRetrievalAttemptRepository,
//     InMemoryRecallSessionRepository, InMemoryReactivationSessionRepository,
//     InMemoryConceptDependencyRepository  → Prisma-backed classes implementing
//     the interfaces in src/repositories/ports.ts (see prisma/schema.prisma).
//   - MockMasteryPort, MockQuestionPort, MockReadinessPort,
//     MockInterventionPort, MockReasoningPort → real clients implementing the
//     interfaces in src/integration/featurePorts.ts.
// Nothing else in this file, and nothing in src/engine or src/services,
// needs to change — they only depend on the interfaces.
// ============================================================================

import 'dotenv/config';
import express from 'express';
import { buildRetentionRouter } from './routes';
import { RetentionService } from '../services/RetentionService';
import { createAIContentProvider } from '../ai/AIContentProvider';
import {
  InMemoryKnowledgeStateRepository,
  InMemoryRetrievalAttemptRepository,
  InMemoryRecallSessionRepository,
  InMemoryReactivationSessionRepository,
  InMemoryConceptDependencyRepository,
} from '../repositories/memory/InMemoryRepositories';
import {
  MockMasteryPort,
  MockQuestionPort,
  MockReadinessPort,
  MockInterventionPort,
  MockReasoningPort,
} from '../integration/featurePorts';
import { EventBus } from '../events/EventBus';

export function createApp() {
  const masteryPort = new MockMasteryPort();

  const service = new RetentionService({
    knowledgeStateRepo: new InMemoryKnowledgeStateRepository(),
    attemptRepo: new InMemoryRetrievalAttemptRepository(),
    recallSessionRepo: new InMemoryRecallSessionRepository(),
    reactivationSessionRepo: new InMemoryReactivationSessionRepository(),
    conceptDependencyRepo: new InMemoryConceptDependencyRepository(),
    masteryPort,
    questionPort: new MockQuestionPort(),
    readinessPort: new MockReadinessPort(),
    interventionPort: new MockInterventionPort(),
    reasoningPort: new MockReasoningPort(),
    aiProvider: createAIContentProvider(),
    eventBus: new EventBus(),
  });

  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true, feature: 19 }));

  // Dev convenience ONLY: seeds the mock mastery port so the API can be
  // exercised with curl/Postman without a real Feature 14 connected. This
  // route has no equivalent in the real system — delete it once
  // MockMasteryPort is replaced with a real client (see the SWAP POINT
  // note above). In production, Feature 14 owns this data; Feature 19
  // only ever reads it.
  app.post('/api/feature19/_dev/mastery-entries', (req, res) => {
    const { studentId, conceptId, masteredAt, masterySuccessRate } = req.body ?? {};
    if (!studentId || !conceptId) {
      res.status(400).json({ error: 'studentId and conceptId are required' });
      return;
    }
    masteryPort.set(studentId, conceptId, {
      masteredAt: masteredAt ?? new Date().toISOString(),
      masterySuccessRate: masterySuccessRate ?? 0.9,
    });
    res.status(201).json({ seeded: true, studentId, conceptId });
  });

  app.use('/api/feature19', buildRetentionRouter(service));

  // Centralized error handler — every route above forwards errors via next(e).
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(400).json({ error: err.message ?? 'Unknown error' });
  });

  return app;
}
