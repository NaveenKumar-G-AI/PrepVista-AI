import { describe, it, expect } from 'vitest';
import { validateNumeric, parseFlexibleNumber } from '../src/domain/engine/validation/numeric.js';

describe('parseFlexibleNumber', () => {
  it('parses plain decimals', () => {
    expect(parseFlexibleNumber('6')).toBe(6);
    expect(parseFlexibleNumber('0.5')).toBe(0.5);
  });
  it('parses fractions', () => {
    expect(parseFlexibleNumber('1/2')).toBe(0.5);
  });
  it('parses percentages', () => {
    expect(parseFlexibleNumber('50%')).toBe(0.5);
  });
  it('returns null for garbage', () => {
    expect(parseFlexibleNumber('banana')).toBeNull();
    expect(parseFlexibleNumber('')).toBeNull();
  });
});

describe('validateNumeric (Section 55: equivalent forms; Section 17: distinct result states)', () => {
  it('accepts an exact match', () => {
    expect(validateNumeric('6', { expected: 6 }).result).toBe('CORRECT');
  });
  it('treats 0.5, 1/2, and 50% as the same correct answer', () => {
    expect(validateNumeric('0.5', { expected: 0.5 }).result).toBe('CORRECT');
    expect(validateNumeric('1/2', { expected: 0.5 }).result).toBe('CORRECT');
    expect(validateNumeric('50%', { expected: 0.5 }).result).toBe('CORRECT');
  });
  it('reports INCOMPLETE for empty input, not INCORRECT', () => {
    expect(validateNumeric('', { expected: 6 }).result).toBe('INCOMPLETE');
  });
  it('reports FORMAT_ERROR for unparsable input', () => {
    expect(validateNumeric('six', { expected: 6 }).result).toBe('FORMAT_ERROR');
  });
  it('reports PARTIALLY_CORRECT for a near-miss rounding slip, not flat INCORRECT', () => {
    const outcome = validateNumeric('6.01', { expected: 6, tolerance: 0.001 });
    expect(outcome.result).toBe('PARTIALLY_CORRECT');
  });
  it('reports INCORRECT for a genuinely wrong value', () => {
    expect(validateNumeric('42', { expected: 6 }).result).toBe('INCORRECT');
  });
});
