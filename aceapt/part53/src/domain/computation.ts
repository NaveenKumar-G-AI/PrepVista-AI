import { evaluateSafeExpression } from '../utils/safeMath.js';

/**
 * A ComputationSpec is optional structured metadata attached to a question version that lets
 * the AnswerValidator / SolutionValidator INDEPENDENTLY re-derive the expected answer instead of
 * trusting the author's stored key blindly (sections 18/19/20/22 — "Do not trust the author's
 * solution blindly. QUESTION -> CANONICAL ANSWER -> INDEPENDENT SOLVER -> COMPARE. If different: FLAG.").
 *
 * It is optional on purpose: plenty of question types (verbal, RC, pure logic puzzles) don't have
 * a clean closed-form answer to re-derive, and a missing ComputationSpec simply means the
 * AnswerValidator falls back to schema-level answer-key consistency checks only (section 26/27).
 */
export type ComputationSpec =
  | { kind: 'PERCENTAGE_OF'; percent: number; of: number }
  | { kind: 'PERCENTAGE_CHANGE'; from: number; to: number }
  | { kind: 'SIMPLE_INTEREST'; principal: number; ratePercent: number; years: number }
  | { kind: 'RATIO_SHARE'; total: number; ratio: number[]; shareIndex: number }
  | { kind: 'AVERAGE'; values: number[] }
  | { kind: 'PROBABILITY'; favorable: number; total: number }
  | { kind: 'CUSTOM_EXPRESSION'; expression: string; variables: Record<string, number> };

export class ComputationError extends Error {}

/**
 * Deterministically derives the expected numeric answer for a ComputationSpec.
 *
 * Deliberately NOT implemented with eval()/Function() for CUSTOM_EXPRESSION: question content
 * (and therefore expression strings sourced from it) is untrusted input — see section 87/132 —
 * so arithmetic is parsed and evaluated by the hand-written recursive-descent evaluator in
 * src/utils/safeMath.ts instead.
 */
export function computeExpectedValue(spec: ComputationSpec): number {
  switch (spec.kind) {
    case 'PERCENTAGE_OF':
      return (spec.percent / 100) * spec.of;

    case 'PERCENTAGE_CHANGE':
      if (spec.from === 0) throw new ComputationError('PERCENTAGE_CHANGE: "from" cannot be 0.');
      return ((spec.to - spec.from) / spec.from) * 100;

    case 'SIMPLE_INTEREST':
      return (spec.principal * spec.ratePercent * spec.years) / 100;

    case 'RATIO_SHARE': {
      const sum = spec.ratio.reduce((a, b) => a + b, 0);
      if (sum === 0) throw new ComputationError('RATIO_SHARE: ratio parts sum to 0.');
      const share = spec.ratio[spec.shareIndex];
      if (share === undefined) throw new ComputationError(`RATIO_SHARE: shareIndex ${spec.shareIndex} is out of range.`);
      return (share / sum) * spec.total;
    }

    case 'AVERAGE':
      if (spec.values.length === 0) throw new ComputationError('AVERAGE: values cannot be empty.');
      return spec.values.reduce((a, b) => a + b, 0) / spec.values.length;

    case 'PROBABILITY':
      if (spec.total === 0) throw new ComputationError('PROBABILITY: total cannot be 0.');
      return spec.favorable / spec.total;

    case 'CUSTOM_EXPRESSION':
      return evaluateSafeExpression(spec.expression, spec.variables);

    default: {
      const _exhaustive: never = spec;
      throw new ComputationError(`Unknown computation kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** How many distinct numeric inputs a computation needs — used by ClarityValidator's
 *  under-specified-question heuristic (section 34). */
export function countNumericParams(spec: ComputationSpec): number {
  switch (spec.kind) {
    case 'PERCENTAGE_OF':
      return 2; // percent, of
    case 'PERCENTAGE_CHANGE':
      return 2; // from, to
    case 'SIMPLE_INTEREST':
      return 3; // principal, rate, years
    case 'RATIO_SHARE':
      return spec.ratio.length + 1; // each ratio part + total
    case 'AVERAGE':
      return spec.values.length;
    case 'PROBABILITY':
      return 2; // favorable, total
    case 'CUSTOM_EXPRESSION':
      return Object.keys(spec.variables).length;
    default:
      return 0;
  }
}
