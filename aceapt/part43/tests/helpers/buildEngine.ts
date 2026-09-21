import { AdaptiveDiagnosticEngine } from '../../src/engine/AdaptiveDiagnosticEngine';
import {
  InMemoryAnalyticsEventPublisher,
  InMemoryDiagnosticSessionRepository,
  InMemoryQuestionRepository,
  InMemorySkillRepository,
  InMemoryStudentRepository,
} from '../../src/infra/repositories/InMemoryRepositories';
import { FixedClock, SeededRandom } from '../../src/infra/determinism';
import { QUESTIONS, SKILLS } from '../../src/infra/seedFixtures';
import { HistoricalSkillEvidence } from '../../src/domain/ports';

export function buildTestEngine(opts?: { seed?: number; history?: Record<string, HistoricalSkillEvidence[]> }) {
  // Deep clone so mutating one test's question bank (e.g. flagging a
  // question) never leaks into another test.
  const questionRepo = new InMemoryQuestionRepository(JSON.parse(JSON.stringify(QUESTIONS)));
  const skillRepo = new InMemorySkillRepository(SKILLS);
  const studentRepo = new InMemoryStudentRepository(opts?.history);
  const sessionRepo = new InMemoryDiagnosticSessionRepository();
  const analytics = new InMemoryAnalyticsEventPublisher();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
  const rng = new SeededRandom(opts?.seed ?? 42);

  const engine = new AdaptiveDiagnosticEngine(studentRepo, questionRepo, skillRepo, sessionRepo, analytics, clock, rng);
  return { engine, questionRepo, skillRepo, sessionRepo, analytics, clock, rng };
}
