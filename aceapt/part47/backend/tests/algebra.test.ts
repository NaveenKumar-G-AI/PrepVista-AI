import { describe, it, expect } from 'vitest';
import { validateAlgebraic } from '../src/domain/engine/validation/algebra.js';

describe('validateAlgebraic (Section 58: substitution-based equivalence, not an LLM judgment)', () => {
  it('accepts a correct pure-number solution written as "x = 5"', () => {
    expect(validateAlgebraic('x = 5', { expectedExpression: 'x = 5' }).result).toBe('CORRECT');
  });

  it('accepts the bare number without "x ="', () => {
    expect(validateAlgebraic('5', { expectedExpression: 'x = 5' }).result).toBe('CORRECT');
  });

  it('rejects an incorrect pure-number solution', () => {
    expect(validateAlgebraic('x = 6', { expectedExpression: 'x = 5' }).result).toBe('INCORRECT');
  });

  it('reports FORMAT_ERROR for a non-mathematical answer', () => {
    expect(validateAlgebraic('banana', { expectedExpression: 'x = 5' }).result).toBe('FORMAT_ERROR');
  });

  it('reports INCOMPLETE for an empty submission', () => {
    expect(validateAlgebraic('', { expectedExpression: 'x = 5' }).result).toBe('INCOMPLETE');
  });

  it('accepts an algebraically equivalent expression with a free variable via substitution testing', () => {
    // (x+1)^2 - 1 is equivalent to x^2 + 2x for all x.
    const outcome = validateAlgebraic('x^2 + 2*x', { expectedExpression: '(x + 1)^2 - 1', variables: ['x'] });
    expect(outcome.result).toBe('CORRECT');
  });

  it('rejects a non-equivalent expression with a free variable', () => {
    const outcome = validateAlgebraic('x^2 + 3*x', { expectedExpression: '(x + 1)^2 - 1', variables: ['x'] });
    expect(outcome.result).toBe('INCORRECT');
  });
});
