import type { StepTemplate } from '../domain/problemBank/types.js';

/**
 * Produces a short, human-readable statement of a step's expected answer.
 * This is called from exactly one place in the whole codebase -
 * GuidedSolvingService.revealFullSolution() - which only runs after the
 * student has explicitly asked to see the full solution (Section 28).
 * Every other code path (hints, explanations, current-step views) must
 * never call this.
 */
export function describeExpectedAnswer(step: StepTemplate): string {
  const validation = step.validation;
  switch (validation.type) {
    case 'NUMERIC_TOLERANCE':
      return String(validation.spec.expected);
    case 'UNIT_VALUE':
      return `${validation.spec.expectedValue} ${validation.spec.expectedUnit}`;
    case 'MULTIPLE_CHOICE': {
      const spec = validation.spec;
      const correct = spec.options.find((o) => o.id === spec.correctOptionId);
      return correct?.label ?? '(unspecified)';
    }
    case 'ALGEBRAIC_EQUIVALENCE':
      return validation.spec.expectedExpression;
    case 'STRUCTURED_FIELD_SET':
      return validation.spec.fields.map((f) => `${f.label} = ${f.expected}`).join(', ');
    case 'ANSWER_KEY':
      return validation.spec.acceptable[0] ?? '(unspecified)';
    /* istanbul ignore next -- exhaustiveness guard */
    default: {
      const _exhaustive: never = validation;
      return _exhaustive;
    }
  }
}
