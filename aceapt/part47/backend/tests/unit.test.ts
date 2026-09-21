import { describe, it, expect } from 'vitest';
import { validateUnitValue } from '../src/domain/engine/validation/unit.js';

const spec = { expectedValue: 6, expectedUnit: 'hours', unitAliases: { hr: 'hours', hrs: 'hours', h: 'hours' } };

describe('validateUnitValue (Section 56: separate numeric correctness from unit correctness)', () => {
  it('accepts the correct value and unit', () => {
    expect(validateUnitValue('6 hours', spec).result).toBe('CORRECT');
  });
  it('accepts unit aliases', () => {
    expect(validateUnitValue('6 hrs', spec).result).toBe('CORRECT');
    expect(validateUnitValue('6 h', spec).result).toBe('CORRECT');
  });
  it('flags a correct number with the wrong unit as UNIT_ERROR, not INCORRECT', () => {
    const outcome = validateUnitValue('6 km', spec);
    expect(outcome.result).toBe('UNIT_ERROR');
    expect(outcome.detail).toMatch(/hours/);
  });
  it('flags a correct unit with the wrong number as INCORRECT', () => {
    expect(validateUnitValue('5 hours', spec).result).toBe('INCORRECT');
  });
  it('reports FORMAT_ERROR when the unit is missing entirely in a garbled input', () => {
    expect(validateUnitValue('abc', spec).result).toBe('FORMAT_ERROR');
  });
  it('reports INCOMPLETE for empty input', () => {
    expect(validateUnitValue('', spec).result).toBe('INCOMPLETE');
  });
});
