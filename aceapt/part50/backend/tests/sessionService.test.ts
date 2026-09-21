import { createInMemorySpeedRepository } from '../src/db/repositories/inMemory';
import { defaultIntegrationProviders } from '../src/integrations/defaultProviders';
import { createAiCoachingService } from '../src/services/aiCoachingService';
import { createSpeedSessionService } from '../src/services/speedSessionService';
import { ForbiddenError } from '../src/errors';
import { ScopeKey, TrainingMode } from '../src/types/domain';

const scope: ScopeKey = { scopeType: 'SKILL', scopeId: 'percentages' };

function buildService() {
  const repo = createInMemorySpeedRepository();
  const aiCoaching = createAiCoachingService({ enabled: false });
  const service = createSpeedSessionService({ repo, providers: defaultIntegrationProviders, aiCoaching });
  return { repo, service };
}

function attemptPayload(overrides: Partial<Parameters<ReturnType<typeof buildService>['service']['submitSpeedAttempt']>[2]> = {}) {
  return {
    question: { questionId: 'q1', skillId: 'percentages', difficulty: 'MEDIUM' as const },
    responseTimeMs: 45000,
    correct: true,
    independent: true,
    hintLevel: 0,
    clientAttemptId: 'client-1',
    ...overrides,
  };
}

describe('speedSessionService - security isolation (spec 141)', () => {
  it('does not allow student B to read student A session', async () => {
    const { service } = buildService();
    const session = await service.startSpeedSession('student-A', { mode: TrainingMode.BALANCED, scope });
    await expect(service.getSpeedSession('student-B', session.id)).rejects.toThrow(ForbiddenError);
  });
});

describe('speedSessionService - session recovery (spec 142)', () => {
  it('returns the same persisted state on repeated reads, as after a browser refresh', async () => {
    const { service } = buildService();
    const session = await service.startSpeedSession('student-A', { mode: TrainingMode.BALANCED, scope });
    await service.submitSpeedAttempt('student-A', session.id, attemptPayload());

    const readOnce = await service.getSpeedSession('student-A', session.id);
    const readAgain = await service.getSpeedSession('student-A', session.id); // simulated refresh
    expect(readAgain).toEqual(readOnce);
  });
});

describe('speedSessionService - concurrency (spec 143)', () => {
  it('persists exactly one attempt when the same clientAttemptId is submitted twice concurrently', async () => {
    const { service, repo } = buildService();
    const session = await service.startSpeedSession('student-A', { mode: TrainingMode.BALANCED, scope });

    const payload = attemptPayload({ clientAttemptId: 'duplicate-key' });
    await Promise.all([
      service.submitSpeedAttempt('student-A', session.id, payload),
      service.submitSpeedAttempt('student-A', session.id, payload),
    ]);

    const stored = await repo.listAttemptsBySession(session.id);
    expect(stored).toHaveLength(1);
  });
});

describe('speedSessionService - happy path', () => {
  it('runs start -> submit x3 -> complete and returns a well-formed summary', async () => {
    const { service } = buildService();
    const session = await service.startSpeedSession('student-A', { mode: TrainingMode.BALANCED, scope });

    await service.submitSpeedAttempt('student-A', session.id, attemptPayload({ clientAttemptId: 'a1', responseTimeMs: 48000 }));
    await service.submitSpeedAttempt('student-A', session.id, attemptPayload({ clientAttemptId: 'a2', responseTimeMs: 46000 }));
    await service.submitSpeedAttempt('student-A', session.id, attemptPayload({ clientAttemptId: 'a3', responseTimeMs: 44000 }));

    const result = await service.completeSpeedSession('student-A', session.id);
    expect(result.attemptCount).toBe(3);
    expect(result.session.state).toBe('COMPLETED');
    expect(result.summary.time.beforeSec).toBeGreaterThanOrEqual(0);
    expect(result.summary.accuracy.after).toBeGreaterThanOrEqual(0);
  });
});
