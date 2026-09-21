import type { UnitValueSpec } from '../../problemBank/types.js';
import type { ValidationOutcome } from './numeric.js';
import { parseFlexibleNumber } from './numeric.js';

const INPUT_PATTERN = /^(-?\d+(?:\.\d+)?)\s*([a-zA-Z%/]*)$/;

/**
 * Validates a "<number> <unit>" answer (e.g. "6 hours") and - critically -
 * reports numeric correctness and unit correctness *separately*, so the
 * feedback can teach ("the number's right, but check the unit") instead of
 * a flat reject (Section 56).
 */
export function validateUnitValue(rawInput: string, spec: UnitValueSpec): ValidationOutcome {
  const trimmed = rawInput?.trim() ?? '';
  if (!trimmed) {
    return { result: 'INCOMPLETE', detail: 'Enter a value with its unit, e.g. "6 hours".' };
  }

  const match = trimmed.match(INPUT_PATTERN);
  if (!match) {
    return {
      result: 'FORMAT_ERROR',
      detail: 'Enter a number followed by a unit, e.g. "6 hours" or "12 km".',
    };
  }

  const value = parseFlexibleNumber(match[1] ?? '');
  const unitRaw = (match[2] ?? '').toLowerCase();
  if (value === null) {
    return { result: 'FORMAT_ERROR', detail: 'That number could not be read - try again.' };
  }

  const canonicalUnit = spec.unitAliases?.[unitRaw] ?? unitRaw;
  const expectedUnitCanonical = spec.expectedUnit.toLowerCase();
  const tolerance = spec.tolerance ?? 0.001;

  const numericOk = Math.abs(value - spec.expectedValue) <= tolerance;
  const unitOk = canonicalUnit === expectedUnitCanonical;

  if (numericOk && unitOk) {
    return { result: 'CORRECT', numericValue: value };
  }
  if (numericOk && !unitOk) {
    return {
      result: 'UNIT_ERROR',
      numericValue: value,
      detail: `The number looks right - but this should be expressed in ${spec.expectedUnit}, not ${unitRaw || 'no unit'}.`,
    };
  }
  if (!numericOk && unitOk) {
    return {
      result: 'INCORRECT',
      numericValue: value,
      detail: 'The unit is right, but the value itself needs another look.',
    };
  }
  return { result: 'INCORRECT', numericValue: value };
}
