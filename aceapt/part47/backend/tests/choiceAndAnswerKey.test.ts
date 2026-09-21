import { describe, it, expect } from 'vitest';
import { validateChoice } from '../src/domain/engine/validation/choice.js';
import { validateAnswerKey } from '../src/domain/engine/validation/answerKey.js';

describe('validateChoice (Section 15: strategy-selection catches method errors)', () => {
  const spec = {
    correctOptionId: 'a',
    options: [
      { id: 'a', label: 'Time = Distance / Speed' },
      { id: 'b', label: 'Time = Distance * Speed' },
    ],
  };
  it('accepts the correct option id', () => {
    expect(validateChoice('a', spec).result).toBe('CORRECT');
  });
  it('rejects a valid-but-wrong option as INCORRECT (a strategy error)', () => {
    expect(validateChoice('b', spec).result).toBe('INCORRECT');
  });
  it('reports FORMAT_ERROR for an option id that does not exist', () => {
    expect(validateChoice('z', spec).result).toBe('FORMAT_ERROR');
  });
  it('reports INCOMPLETE when nothing is selected', () => {
    expect(validateChoice('', spec).result).toBe('INCOMPLETE');
  });
});

describe('validateAnswerKey (Section 60: verbal question types use a trusted key)', () => {
  const spec = { acceptable: ['time', 'the time', 'time taken'] };
  it('matches case-insensitively by default', () => {
    expect(validateAnswerKey('TIME', spec).result).toBe('CORRECT');
    expect(validateAnswerKey('  the time  ', spec).result).toBe('CORRECT');
  });
  it('rejects an answer not in the key', () => {
    expect(validateAnswerKey('speed', spec).result).toBe('INCORRECT');
  });
});
