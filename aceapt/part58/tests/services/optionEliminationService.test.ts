import { describe, expect, it } from 'vitest';
import { OptionEliminationService } from '../../src/services/optionEliminationService';
import type { QuestionEliminationVerifier } from '../../src/ports';

describe('OptionEliminationService', () => {
  it('records SELF_REPORTED when no verifier can confirm the elimination (§102-103)', async () => {
    const service = new OptionEliminationService({ async verifyElimination() { return 'SELF_REPORTED'; } });
    const signals = await service.recordElimination({
      questionVersionId: 'q1',
      eliminatedOptionIds: ['A', 'C'],
      claimedType: 'OPTION_ELIMINATED_UNIT',
    });
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.level === 'SELF_REPORTED')).toBe(true);
  });

  it('passes through a VERIFIED level when a real verifier confirms it', async () => {
    const verifier: QuestionEliminationVerifier = { async verifyElimination() { return 'VERIFIED'; } };
    const service = new OptionEliminationService(verifier);
    const signals = await service.recordElimination({
      questionVersionId: 'q1',
      eliminatedOptionIds: ['B'],
      claimedType: 'OPTION_ELIMINATED_MAGNITUDE',
    });
    expect(signals[0].level).toBe('VERIFIED');
  });

  it('never silently upgrades trust when the verifier itself throws', async () => {
    const service = new OptionEliminationService({
      async verifyElimination() {
        throw new Error('verifier unavailable');
      },
    });
    const signals = await service.recordElimination({
      questionVersionId: 'q1',
      eliminatedOptionIds: ['D'],
      claimedType: 'OPTION_ELIMINATED_SIGN',
    });
    expect(signals[0].level).toBe('SELF_REPORTED');
  });

  it('rejects a non-elimination evidence type', async () => {
    const service = new OptionEliminationService({ async verifyElimination() { return 'VERIFIED'; } });
    await expect(
      service.recordElimination({ questionVersionId: 'q1', eliminatedOptionIds: ['A'], claimedType: 'FORMULA_INSIGHT' })
    ).rejects.toThrow();
  });
});
