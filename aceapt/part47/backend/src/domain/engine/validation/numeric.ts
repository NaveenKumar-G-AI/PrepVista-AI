import type { NumericToleranceSpec, StepResult } from '../../problemBank/types.js';

export interface ValidationOutcome {
  result: StepResult;
  /** The value we actually compared, once parsed - useful for error localization and analytics. */
  numericValue?: number;
  /**
   * For STRUCTURED_FIELD_SET steps: the individual numeric fields the
   * student entered (e.g. { distance: 380, speed: 60 }), keyed by field
   * key. This is what lets a later CALCULATE step's
   * `deriveExpectedGivenPriorAttempts` charitably recompute its expected
   * value from an earlier *field-level* mistake, not just a single-value
   * step (see errorLocalization.ts).
   */
  structuredValues?: Record<string, number>;
  /** Short, human, non-shaming explanation of what happened (Section 52-53). Never "Wrong." */
  detail?: string;
}

/**
 * Parses "0.5", "1/2", and "50%" as the same underlying value (Section 55:
 * normalize equivalent forms) while still reporting FORMAT_ERROR for
 * genuinely unparsable input rather than silently treating it as 0.
 */
export function parseFlexibleNumber(raw: string): number | null {
  const s = raw.trim();
  if (s.length === 0) return null;

  if (/^-?\d+(\.\d+)?\s*%$/.test(s)) {
    return parseFloat(s) / 100;
  }

  const fraction = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return numerator / denominator;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function validateNumeric(rawInput: string, spec: NumericToleranceSpec): ValidationOutcome {
  if (!rawInput || !rawInput.trim()) {
    return { result: 'INCOMPLETE', detail: 'Enter a value before submitting.' };
  }

  const value = parseFlexibleNumber(rawInput);
  if (value === null) {
    return {
      result: 'FORMAT_ERROR',
      detail: 'Enter a number - a decimal, a fraction like 1/2, or a percent like 50% all work.',
    };
  }

  const tolerance = spec.tolerance ?? 0.001;
  const diff = Math.abs(value - spec.expected);

  if (diff <= tolerance) {
    return { result: 'CORRECT', numericValue: value };
  }

  // A value close enough to suggest a rounding/precision slip, not a
  // conceptual miss, is reported distinctly rather than as flat INCORRECT
  // (Section 17: don't collapse every failure into "wrong").
  if (diff <= tolerance * 25) {
    return {
      result: 'PARTIALLY_CORRECT',
      numericValue: value,
      detail: 'Close - double check your rounding or a decimal place.',
    };
  }

  return { result: 'INCORRECT', numericValue: value };
}
