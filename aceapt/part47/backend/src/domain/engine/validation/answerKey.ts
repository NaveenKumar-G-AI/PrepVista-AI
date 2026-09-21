import type { AnswerKeySpec } from '../../problemBank/types.js';
import type { ValidationOutcome } from './numeric.js';

/**
 * For grammar / vocabulary / reading comprehension, correctness comes from
 * a trusted answer key or metadata, not from an LLM's judgment (Section 60,
 * Section 61: AI communicates/adapts explanations, it does not invent the
 * answer).
 */
export function validateAnswerKey(rawInput: string, spec: AnswerKeySpec): ValidationOutcome {
  const trimmed = rawInput?.trim() ?? '';
  if (!trimmed) {
    return { result: 'INCOMPLETE', detail: 'Enter or select an answer before submitting.' };
  }
  const normalize = (s: string) => (spec.caseSensitive ? s.trim() : s.trim().toLowerCase());
  const input = normalize(trimmed);
  const matched = spec.acceptable.some((candidate) => normalize(candidate) === input);
  return matched ? { result: 'CORRECT' } : { result: 'INCORRECT' };
}
