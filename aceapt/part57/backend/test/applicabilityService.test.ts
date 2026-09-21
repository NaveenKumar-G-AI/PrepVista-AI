import { describe, it, expect } from 'vitest';
import { evaluateApplicability } from '../src/services/applicabilityService';

const baseShortcut = {
  conditions: [{ field: 'percentage', op: 'eq' as const, value: 25 }],
  nonApplicability: [],
  requiresOptions: false,
  isApproximation: false,
};

describe('evaluateApplicability', () => {
  it('is APPLICABLE when the declared condition matches (sec. 34, 246)', () => {
    const outcome = evaluateApplicability(baseShortcut, { attributes: { percentage: 25 } });
    expect(outcome.result).toBe('APPLICABLE');
  });

  it('is NOT_APPLICABLE when the condition does not match (sec. 247, generalization protection)', () => {
    const outcome = evaluateApplicability(baseShortcut, { attributes: { percentage: 15 } });
    expect(outcome.result).toBe('NOT_APPLICABLE');
  });

  it('is UNKNOWN when the question context does not say (sec. 34)', () => {
    const outcome = evaluateApplicability(baseShortcut, { attributes: {} });
    expect(outcome.result).toBe('UNKNOWN');
  });

  it('is NOT_APPLICABLE for an options-dependent method with no options (secs. 109-110, 262)', () => {
    const outcome = evaluateApplicability({ ...baseShortcut, requiresOptions: true, conditions: [] }, { hasOptions: false });
    expect(outcome.result).toBe('NOT_APPLICABLE');
  });

  it('is NOT_APPLICABLE for an approximation method when an exact answer is required (secs. 107-108, 263)', () => {
    const outcome = evaluateApplicability({ ...baseShortcut, isApproximation: true, conditions: [] }, { answerType: 'EXACT' });
    expect(outcome.result).toBe('NOT_APPLICABLE');
  });

  it('is CONDITIONALLY_APPLICABLE for an approximation method when an exact answer is not required', () => {
    const outcome = evaluateApplicability({ ...baseShortcut, isApproximation: true, conditions: [] }, { answerType: 'APPROXIMATE_OK' });
    expect(outcome.result).toBe('CONDITIONALLY_APPLICABLE');
  });

  it('lets explicit non-applicability override an otherwise-matching condition (sec. 25, 29)', () => {
    const outcome = evaluateApplicability(
      { ...baseShortcut, conditions: [], nonApplicability: [{ field: 'novelty', op: 'eq', value: 'NOVEL' }] },
      { attributes: {}, novelty: 'NOVEL' }
    );
    expect(outcome.result).toBe('NOT_APPLICABLE');
  });
});
