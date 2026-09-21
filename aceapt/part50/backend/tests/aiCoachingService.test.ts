import { createAiCoachingService } from '../src/services/aiCoachingService';
import { BottleneckType, TrainingMode, TrainingPolicyDecision } from '../src/types/domain';

const decision: TrainingPolicyDecision = {
  signal: BottleneckType.RUSHING,
  pressureAction: 'DECREASE',
  nextMode: TrainingMode.BALANCED,
  nextTargetMs: 60000,
  message: "Your pace increased, but accuracy dropped. Let's return to a safer pace.",
  evidence: ['Accuracy fell while response times dropped.'],
  requiresCoachingNarrative: true,
};

describe('aiCoachingService (spec 79-81, 144)', () => {
  it('returns the deterministic message unchanged when AI coaching is disabled', async () => {
    const service = createAiCoachingService({ enabled: false });
    const result = await service.enrich(decision);
    expect(result).toBe(decision.message);
  });

  it('returns the deterministic message unchanged when no API key is configured', async () => {
    const service = createAiCoachingService({ enabled: true, apiKey: '' });
    const result = await service.enrich(decision);
    expect(result).toBe(decision.message);
  });

  it('falls back to the deterministic message when the API call throws (network failure)', async () => {
    const failingFetch = jest.fn().mockRejectedValue(new Error('network down'));
    const service = createAiCoachingService({ enabled: true, apiKey: 'test-key', fetchImpl: failingFetch as unknown as typeof fetch });
    const result = await service.enrich(decision);
    expect(result).toBe(decision.message);
    expect(failingFetch).toHaveBeenCalled();
  });

  it('falls back to the deterministic message when the API returns a non-OK response', async () => {
    const badFetch = jest.fn().mockResolvedValue({ ok: false } as Response);
    const service = createAiCoachingService({ enabled: true, apiKey: 'test-key', fetchImpl: badFetch as unknown as typeof fetch });
    const result = await service.enrich(decision);
    expect(result).toBe(decision.message);
  });

  it('uses the AI-rewritten text when the call succeeds', async () => {
    const goodFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Nice pace change - let\u2019s settle back in.' }] }),
    } as Response);
    const service = createAiCoachingService({ enabled: true, apiKey: 'test-key', fetchImpl: goodFetch as unknown as typeof fetch });
    const result = await service.enrich(decision);
    expect(result).toContain('settle back in');
  });

  it('never changes the underlying signal or target - only the wording (spec 79)', async () => {
    const goodFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Different wording entirely.' }] }),
    } as Response);
    const service = createAiCoachingService({ enabled: true, apiKey: 'test-key', fetchImpl: goodFetch as unknown as typeof fetch });
    const before = { ...decision };
    await service.enrich(decision);
    expect(decision).toEqual(before); // the decision object itself is untouched
  });
});
