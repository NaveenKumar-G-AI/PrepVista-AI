import { describe, expect, it } from 'vitest';
import { stripLiveCoachingFields } from '../../src/middleware/assessmentIntegrityGuard';
import type { DecisionPolicy } from '../../src/types';

const leakyPayload = {
  event: { id: 'e1', action: 'ELIMINATE' },
  recommendedAction: 'CHANGE_ANSWER',
  coaching: 'You should pick option C.',
  nested: { hint: 'the answer is probably B' },
};

function policyWith(strategyAssistance: DecisionPolicy['strategyAssistance']): DecisionPolicy {
  return {
    id: 'p1',
    tenantId: 't1',
    assessmentVersionId: 'v1',
    correctReward: 1,
    wrongPenalty: 0,
    blankValue: 0,
    navigationRules: { canSkip: true, canReturnLater: true, canChangeAnswer: true },
    strategyAssistance,
    source: 'VERIFIED',
    version: 1,
    effectiveFrom: new Date().toISOString(),
  };
}

describe('stripLiveCoachingFields', () => {
  it('strips every blocked field, including nested ones, during a FORMAL_ASSESSMENT with no explicit policy override (§118, §190)', () => {
    const result = stripLiveCoachingFields('FORMAL_ASSESSMENT', leakyPayload, null) as typeof leakyPayload;
    expect(result).not.toHaveProperty('recommendedAction');
    expect(result).not.toHaveProperty('coaching');
    expect((result.nested as Record<string, unknown>)).not.toHaveProperty('hint');
    expect(result.event).toEqual(leakyPayload.event); // unrelated fields survive
  });

  it('does not strip anything in TRAINING, PRACTICE, or MOCK contexts', () => {
    for (const context of ['TRAINING', 'PRACTICE', 'MOCK'] as const) {
      const result = stripLiveCoachingFields(context, leakyPayload, null);
      expect(result).toEqual(leakyPayload);
    }
  });

  it('does not strip when the assessment policy explicitly turns on FULL strategy assistance (§118 "unless explicitly designed into assessment")', () => {
    const result = stripLiveCoachingFields('FORMAL_ASSESSMENT', leakyPayload, policyWith('FULL'));
    expect(result).toEqual(leakyPayload);
  });

  it('still strips for any assistance level short of FULL, including an UNKNOWN-source policy', () => {
    const result = stripLiveCoachingFields('FORMAL_ASSESSMENT', leakyPayload, policyWith('LIVE_LIMITED'));
    expect(result).not.toHaveProperty('recommendedAction');
  });

  it('is a no-op pass-through for payloads that never had a blocked field', () => {
    const safePayload = { event: { id: 'e1' }, explanation: 'ok' };
    expect(stripLiveCoachingFields('FORMAL_ASSESSMENT', safePayload, null)).toEqual(safePayload);
  });

  it('strips inside arrays of objects too', () => {
    const payload = { items: [{ id: 1, hint: 'x' }, { id: 2 }] };
    const result = stripLiveCoachingFields('FORMAL_ASSESSMENT', payload, null) as typeof payload;
    expect(result.items[0]).not.toHaveProperty('hint');
    expect(result.items[1]).toEqual({ id: 2 });
  });
});
