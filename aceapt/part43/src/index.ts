import 'dotenv/config';
import express from 'express';
import { AdaptiveDiagnosticEngine } from './engine/AdaptiveDiagnosticEngine';
import { buildAdaptiveDiagnosticRouter } from './api/routes';
import {
  InMemoryAnalyticsEventPublisher,
  InMemoryDiagnosticSessionRepository,
  InMemoryQuestionRepository,
  InMemorySkillRepository,
  InMemoryStudentRepository,
} from './infra/repositories/InMemoryRepositories';
import { SystemClock, SystemRandom } from './infra/determinism';
import { QUESTIONS, SKILLS } from './infra/seedFixtures';

const app = express();
app.use(express.json());

const engine = new AdaptiveDiagnosticEngine(
  new InMemoryStudentRepository(),
  new InMemoryQuestionRepository(QUESTIONS),
  new InMemorySkillRepository(SKILLS),
  new InMemoryDiagnosticSessionRepository(),
  new InMemoryAnalyticsEventPublisher(),
  new SystemClock(),
  new SystemRandom()
);

app.use('/api', buildAdaptiveDiagnosticRouter(engine));
app.get('/health', (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`ACEAPT Feature 43 (Adaptive Diagnostic Engine) demo server listening on :${port}`);
  // eslint-disable-next-line no-console
  console.log('Using IN-MEMORY repositories - local/demo use only, nothing persists across restarts.');
  // eslint-disable-next-line no-console
  console.log('Replace src/infra/repositories with real adapters before deploying (see README.md).');
});
