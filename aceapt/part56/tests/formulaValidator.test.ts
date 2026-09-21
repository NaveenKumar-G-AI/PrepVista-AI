import { describe, expect, it } from 'vitest';
import { parseEquation, validateDerivedForm } from '../src/validation/formulaValidator';

describe('parseEquation', () => {
  it('splits target and expression', () => {
    expect(parseEquation('D = S * T')).toEqual({ target: 'D', expression: 'S * T' });
  });

  it('throws on malformed input', () => {
    expect(() => parseEquation('D S T')).toThrow();
  });
});

describe('validateDerivedForm', () => {
  const variables = ['D', 'S', 'T'];

  it('accepts a correct inverse form (S = D / T)', () => {
    const result = validateDerivedForm('D = S * T', { targetVariable: 'S', expression: 'S = D / T' }, variables);
    expect(result.valid).toBe(true);
  });

  it('accepts the other correct inverse form (T = D / S)', () => {
    const result = validateDerivedForm('D = S * T', { targetVariable: 'T', expression: 'T = D / S' }, variables);
    expect(result.valid).toBe(true);
  });

  it('rejects an algebraically wrong derived form', () => {
    const result = validateDerivedForm('D = S * T', { targetVariable: 'S', expression: 'S = D * T' }, variables);
    expect(result.valid).toBe(false);
    expect(result.counterexample).toBeDefined();
  });

  it('validates a compound-interest derived form that needs a logarithm', () => {
    const result = validateDerivedForm(
      'A = P * (1 + R / 100) ^ T',
      { targetVariable: 'T', expression: 'T = log(A / P) / log(1 + R / 100)' },
      ['A', 'P', 'R', 'T'],
    );
    expect(result.valid).toBe(true);
  });

  it('validates the simple-interest principal inversion', () => {
    const result = validateDerivedForm(
      'SI = (P * R * T) / 100',
      { targetVariable: 'P', expression: 'P = (SI * 100) / (R * T)' },
      ['SI', 'P', 'R', 'T'],
    );
    expect(result.valid).toBe(true);
  });
});
