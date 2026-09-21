import type { MultipleChoiceSpec } from '../../problemBank/types.js';
import type { ValidationOutcome } from './numeric.js';

/**
 * Validates a strategy/formula selection (e.g. "which relationship do we
 * use?"). This is what lets the engine catch a *strategy* error before the
 * student sinks time into calculating with the wrong approach (Section 15,
 * Section 98 test scenario).
 */
export function validateChoice(rawInput: string, spec: MultipleChoiceSpec): ValidationOutcome {
  const id = rawInput?.trim() ?? '';
  if (!id) {
    return { result: 'INCOMPLETE', detail: 'Pick one of the options above.' };
  }
  const exists = spec.options.some((o) => o.id === id);
  if (!exists) {
    return { result: 'FORMAT_ERROR', detail: 'That option was not recognized - please pick one from the list.' };
  }
  if (id === spec.correctOptionId) {
    return { result: 'CORRECT' };
  }
  return { result: 'INCORRECT', detail: 'That relationship does not fit what we identified in the previous step.' };
}
