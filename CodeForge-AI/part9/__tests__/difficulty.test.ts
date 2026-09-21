import { describe, expect, it } from 'vitest';
import { suggestNextDifficulty } from '../src/domain/difficulty.js';

describe('suggestNextDifficulty — PHASE 22/23', () => {
  it('starts at easy with fewer than 2 recent results', () => {
    expect(suggestNextDifficulty([])).toBe('easy');
    expect(suggestNextDifficulty([{ difficulty: 'medium', passed: true }])).toBe('easy');
  });

  it('steps up one level after consistent recent success', () => {
    const result = suggestNextDifficulty([
      { difficulty: 'easy', passed: true },
      { difficulty: 'easy', passed: true },
      { difficulty: 'easy', passed: true },
    ]);
    expect(result).toBe('medium');
  });

  it('never jumps more than one level, even after many easy passes', () => {
    const result = suggestNextDifficulty([
      { difficulty: 'easy', passed: true },
      { difficulty: 'easy', passed: true },
    ]);
    expect(result).not.toBe('hard');
  });

  it('steps down one level after consistent recent failure', () => {
    const result = suggestNextDifficulty([
      { difficulty: 'hard', passed: false },
      { difficulty: 'hard', passed: false },
      { difficulty: 'hard', passed: false },
    ]);
    expect(result).toBe('medium');
  });

  it('does not go below easy', () => {
    const result = suggestNextDifficulty([
      { difficulty: 'easy', passed: false },
      { difficulty: 'easy', passed: false },
    ]);
    expect(result).toBe('easy');
  });

  it('holds steady on mixed recent results rather than guessing a direction', () => {
    const result = suggestNextDifficulty([
      { difficulty: 'medium', passed: true },
      { difficulty: 'medium', passed: false },
      { difficulty: 'medium', passed: true },
    ]);
    expect(result).toBe('medium');
  });
});
