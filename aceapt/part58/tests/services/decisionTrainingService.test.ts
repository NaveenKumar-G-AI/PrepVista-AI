import { describe, expect, it } from 'vitest';
import { DecisionTrainingService } from '../../src/services/decisionTrainingService';
import { FakeDecisionEventRepository, baseDecisionEventInput } from '../fakes';
import type { ScenarioRepository } from '../../src/repositories/types';
import type { DifficultyProvider } from '../../src/ports';

function fakeScenarioRepo(): ScenarioRepository {
  return {
    async create(s) {
      return { ...s, id: 's1', createdAt: new Date().toISOString() };
    },
    async findById() {
      return null;
    },
    async findServable(tenantId, mode, difficultyLevel) {
      return {
        id: 's1',
        tenantId,
        mode,
        difficultyLevel,
        questionVersionId: null,
        policyVersionId: null,
        generatedBy: 'CURATED',
        validationStatus: 'VALIDATED',
        payload: {},
        createdAt: new Date().toISOString(),
      };
    },
    async markValidated() {},
  };
}

const noopDifficultyProvider: DifficultyProvider = { async getCalibratedDifficulty() { return null; } };

function buildService() {
  const events = new FakeDecisionEventRepository();
  const published: string[] = [];
  const analytics = { async publish(event: string) { published.push(event); } };
  const service = new DecisionTrainingService(fakeScenarioRepo(), events, noopDifficultyProvider, analytics);
  return { service, events, published };
}

describe('DecisionTrainingService.submitDecision', () => {
  it('never returns a coaching note for a FORMAL_ASSESSMENT decision (§119, §190)', async () => {
    const { service } = buildService();
    const result = await service.submitDecision(
      baseDecisionEventInput({ context: 'FORMAL_ASSESSMENT' }),
      { gradedIsCorrect: false }
    );
    expect(result.coaching).toBeNull();
  });

  it('returns a coaching note for a TRAINING decision once graded', async () => {
    const { service } = buildService();
    const result = await service.submitDecision(baseDecisionEventInput({ context: 'TRAINING' }), { gradedIsCorrect: true });
    expect(result.coaching).not.toBeNull();
    expect(result.event.isCorrect).toBe(true);
    expect(result.event.decisionQuality).not.toBeNull();
  });

  it('withholds coaching when no grading result is supplied yet', async () => {
    const { service } = buildService();
    const result = await service.submitDecision(baseDecisionEventInput({ context: 'PRACTICE' }));
    expect(result.coaching).toBeNull();
  });

  it('is idempotent: resubmitting the same idempotency key does not create a second event (§202)', async () => {
    const { service, events } = buildService();
    const input = baseDecisionEventInput({ idempotencyKey: 'fixed-key-1' });
    const first = await service.submitDecision(input);
    const second = await service.submitDecision(input);
    expect(first.event.id).toBe(second.event.id);
    expect(events.events).toHaveLength(1);
  });

  it('publishes the relevant analytics events for a blind guess', async () => {
    const { service, published } = buildService();
    await service.submitDecision(baseDecisionEventInput({ action: 'BLIND_GUESS' }));
    expect(published).toContain('blind_guess_recorded');
    expect(published).toContain('guess_made');
    expect(published).toContain('action_selected');
  });
});
