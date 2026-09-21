/**
 * spec §24–§27: numeric equivalence (0.5 / 1/2 / 50%) and percentage-vs-raw-number
 * distinction. This module is the single place that turns "whatever shape an
 * author typed the answer in" into one comparable number, so every validator
 * that needs a number (Answer/Options/Solution/Math/Units) agrees on what a
 * given declared answer numerically MEANS.
 */
export interface NumericExtraction {
  value: number;
  /** True if the literal was written with a trailing "%" — kept separate from
   *  `value` (which is always the fractional form, e.g. "50%" -> 0.5) so
   *  PERCENTAGE_REPRESENTATION_MISMATCH can be detected by callers that care. */
  wasPercentageLiteral: boolean;
}

const FRACTION_RE = /^\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)\s*$/;
const PERCENTAGE_RE = /^\s*(-?\d+(?:\.\d+)?)\s*%\s*$/;
const PLAIN_NUMBER_RE = /^\s*-?\d+(?:\.\d+)?\s*(?:e-?\d+)?\s*$/i;

export function extractNumericValue(raw: unknown): NumericExtraction | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { value: raw, wasPercentageLiteral: false };
  }
  if (typeof raw !== "string") return undefined;

  const percentMatch = PERCENTAGE_RE.exec(raw);
  if (percentMatch) {
    return { value: Number(percentMatch[1]) / 100, wasPercentageLiteral: true };
  }

  const fractionMatch = FRACTION_RE.exec(raw);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (denominator === 0) return undefined;
    return { value: numerator / denominator, wasPercentageLiteral: false };
  }

  if (PLAIN_NUMBER_RE.test(raw)) {
    return { value: Number(raw), wasPercentageLiteral: false };
  }

  return undefined;
}

/** Two numeric literals are "equivalent forms" of the same value (spec §25) only
 *  when both resolve to numbers and the fractional values match within tolerance —
 *  0.5, 1/2, and 50% all satisfy this; 20 and 20% do NOT (spec §27), because one
 *  is 20 and the other is 0.20. */
export function areEquivalentForms(a: unknown, b: unknown, tolerance = 1e-9): boolean {
  const ea = extractNumericValue(a);
  const eb = extractNumericValue(b);
  if (!ea || !eb) return false;
  return Math.abs(ea.value - eb.value) <= tolerance;
}
