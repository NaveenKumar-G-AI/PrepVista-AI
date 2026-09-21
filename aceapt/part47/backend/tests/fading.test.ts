import { describe, it, expect } from 'vitest';
import { recommendNextHelpLevel, computeGuidanceDependency } from '../src/domain/engine/fading.js';

describe('recommendNextHelpLevel (Sections 33-34, 78, 104: evidence-based fading)', () => {
  it('defaults to a step outline (not zero) for a brand new student with no history', () => {
    expect(recommendNextHelpLevel([])).toBe(1);
  });
  it('fades to zero assistance after consecutive independent solves', () => {
    const history = [
      { outcome: 'INDEPENDENT' as const, hintsUsed: 0 },
      { outcome: 'INDEPENDENT' as const, hintsUsed: 0 },
    ];
    expect(recommendNextHelpLevel(history)).toBe(0);
  });
  it('raises scaffolding again after a failure or a revealed solution', () => {
    const history = [
      { outcome: 'INDEPENDENT' as const, hintsUsed: 0 },
      { outcome: 'FAILED' as const, hintsUsed: 3 },
    ];
    expect(recommendNextHelpLevel(history)).toBe(2);
  });
});

describe('computeGuidanceDependency (Section 46: a signal, not a verdict)', () => {
  it('is LOW with zero hints and at most one retry', () => {
    expect(computeGuidanceDependency({ stepsTotal: 5, hintsUsed: 0, retries: 1 })).toBe('LOW');
  });
  it('is HIGH when hints were needed on more than half the steps', () => {
    expect(computeGuidanceDependency({ stepsTotal: 4, hintsUsed: 3, retries: 2 })).toBe('HIGH');
  });
  it('is MODERATE in between', () => {
    expect(computeGuidanceDependency({ stepsTotal: 10, hintsUsed: 2, retries: 1 })).toBe('MODERATE');
  });
});
