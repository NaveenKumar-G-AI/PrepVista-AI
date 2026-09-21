import { evaluate } from 'mathjs';
import { DerivedForm } from '../types';

/**
 * Deterministic numeric validation for derived/inverse formula forms (spec
 * sections 100-102, 108, 205, 228).
 *
 * Strategy: randomized-trial identity checking. For each trial we assign
 * random positive values to every "input" variable of the canonical
 * equation, compute the canonical target from them, then check that the
 * derived form recomputes the expected variable from the same values. This
 * is a standard, well-established technique for catching incorrect
 * algebraic identities without building a full computer-algebra proof
 * engine - if an identity is wrong, it fails on almost any random point, so
 * a few hundred trials gives very high confidence without symbolic
 * manipulation.
 *
 * This is intentionally NOT a claim of formal symbolic proof. For
 * high-stakes canonical content you still want human review (spec sections
 * 13, 146-148) - this validator is the fast, automatic first line of
 * defense described in section 108/205, not a replacement for it.
 */

const TRIALS = 250;
const RELATIVE_TOLERANCE = 1e-6;
const MIN_RANDOM = 1;
const MAX_RANDOM = 100;

export interface EquationParts {
  target: string;
  expression: string;
}

export function parseEquation(equation: string): EquationParts {
  const parts = equation.split('=');
  if (parts.length !== 2) {
    throw new Error(`Cannot parse equation "${equation}" - expected a single "target = expression" form.`);
  }
  const target = parts[0].trim();
  const expression = parts[1].trim();
  if (!target || !expression) {
    throw new Error(`Cannot parse equation "${equation}" - empty target or expression.`);
  }
  return { target, expression };
}

function randomPositive(): number {
  return MIN_RANDOM + Math.random() * (MAX_RANDOM - MIN_RANDOM);
}

export interface ValidationResult {
  valid: boolean;
  trialsRun: number;
  counterexample?: { scope: Record<string, number>; expected: number; computed: number };
  error?: string;
}

/** Validates that `derived` is algebraically consistent with `canonical`. */
export function validateDerivedForm(
  canonicalExpression: string,
  derived: DerivedForm,
  variableSymbols: string[],
): ValidationResult {
  let canonical: EquationParts;
  let derivedParts: EquationParts;
  try {
    canonical = parseEquation(canonicalExpression);
    derivedParts = parseEquation(derived.expression);
  } catch (err) {
    return { valid: false, trialsRun: 0, error: (err as Error).message };
  }

  for (let trial = 0; trial < TRIALS; trial++) {
    const scope: Record<string, number> = {};
    for (const symbol of variableSymbols) {
      if (symbol !== canonical.target) {
        scope[symbol] = randomPositive();
      }
    }

    let canonicalValue: number;
    try {
      canonicalValue = evaluate(canonical.expression, scope) as number;
    } catch (err) {
      return {
        valid: false,
        trialsRun: trial,
        error: `Canonical expression failed to evaluate: ${(err as Error).message}`,
      };
    }
    scope[canonical.target] = canonicalValue;

    const inputScope = { ...scope };
    delete inputScope[derivedParts.target];

    let computed: number;
    try {
      computed = evaluate(derivedParts.expression, inputScope) as number;
    } catch (err) {
      return {
        valid: false,
        trialsRun: trial,
        error: `Derived expression failed to evaluate: ${(err as Error).message}`,
      };
    }
    const expected = scope[derivedParts.target];

    if (!Number.isFinite(computed) || !Number.isFinite(expected)) {
      return { valid: false, trialsRun: trial, counterexample: { scope, expected, computed } };
    }

    const diff = Math.abs(computed - expected);
    const scale = Math.max(1, Math.abs(expected));
    if (diff > RELATIVE_TOLERANCE * scale) {
      return { valid: false, trialsRun: trial, counterexample: { scope, expected, computed } };
    }
  }

  return { valid: true, trialsRun: TRIALS };
}

/** Validates every derived form attached to a formula. Never mutates the input. */
export function validateAllDerivedForms(
  canonicalExpression: string,
  derivedForms: DerivedForm[],
  variableSymbols: string[],
): DerivedForm[] {
  return derivedForms.map((form) => ({
    ...form,
    validated: validateDerivedForm(canonicalExpression, form, variableSymbols).valid,
  }));
}
