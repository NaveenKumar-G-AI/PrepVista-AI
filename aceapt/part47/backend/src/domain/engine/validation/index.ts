import type { StepTemplate } from '../../problemBank/types.js';
import type { ValidationOutcome } from './numeric.js';
import { validateNumeric } from './numeric.js';
import { validateUnitValue } from './unit.js';
import { validateChoice } from './choice.js';
import { validateAlgebraic } from './algebra.js';
import { validateAnswerKey } from './answerKey.js';
import { validateStructuredFields } from './structuredFields.js';

export type { ValidationOutcome } from './numeric.js';

/**
 * Single entry point the rest of the engine calls to grade a step attempt.
 * This function is the concrete enforcement of Section 57 ("do not use an
 * LLM as the sole mathematical evaluator") - every branch here is plain,
 * deterministic, testable code. The AI layer (domain/ai) is never on this
 * path; it only gets called *after* a result already exists, to help put
 * that result into words.
 */
export function validateStep(step: StepTemplate, rawInput: string): ValidationOutcome {
  switch (step.validation.type) {
    case 'NUMERIC_TOLERANCE':
      return validateNumeric(rawInput, step.validation.spec);
    case 'UNIT_VALUE':
      return validateUnitValue(rawInput, step.validation.spec);
    case 'MULTIPLE_CHOICE':
      return validateChoice(rawInput, step.validation.spec);
    case 'ALGEBRAIC_EQUIVALENCE':
      return validateAlgebraic(rawInput, step.validation.spec);
    case 'STRUCTURED_FIELD_SET':
      return validateStructuredFields(rawInput, step.validation.spec);
    case 'ANSWER_KEY':
      return validateAnswerKey(rawInput, step.validation.spec);
    /* istanbul ignore next -- exhaustiveness guard, not a reachable runtime branch */
    default: {
      const _exhaustive: never = step.validation;
      return _exhaustive;
    }
  }
}
