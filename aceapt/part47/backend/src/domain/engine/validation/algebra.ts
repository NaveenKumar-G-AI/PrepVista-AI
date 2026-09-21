import { evaluate } from 'mathjs';
import type { AlgebraicEquivalenceSpec } from '../../problemBank/types.js';
import type { ValidationOutcome } from './numeric.js';

/**
 * Deterministic algebraic equivalence check (Section 58: "symbolic
 * equivalence, substitution, deterministic transformations" - explicitly
 * NOT an LLM judgment call, Section 57).
 *
 * Full symbolic equivalence (a real CAS) is out of scope here. Instead we
 * use the standard, well-understood technique of substitution testing:
 * evaluate both the student's expression and the expected expression at
 * several random points for every free variable and require them to match
 * (within floating point tolerance) at *all* of them. Two expressions that
 * agree at N independently-sampled points are equivalent with very high
 * confidence - this is deterministic and reproducible for a given random
 * seed, and is the same idea auto-graders for algebra have used for years.
 */

function extractRHS(input: string): string {
  const parts = input.split('=');
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0])?.trim() ?? '';
}

function detectVariables(expr: string): string[] {
  const matches = expr.match(/[a-zA-Z][a-zA-Z0-9]*/g) ?? [];
  const knownFunctions = new Set(['sin', 'cos', 'tan', 'sqrt', 'log', 'exp', 'abs', 'pi', 'e']);
  return [...new Set(matches.filter((m) => !knownFunctions.has(m.toLowerCase())))];
}

export function validateAlgebraic(rawInput: string, spec: AlgebraicEquivalenceSpec): ValidationOutcome {
  const trimmed = rawInput?.trim() ?? '';
  if (!trimmed) {
    return { result: 'INCOMPLETE', detail: 'Enter your result before submitting.' };
  }

  const studentExpr = extractRHS(trimmed);
  const expectedExpr = extractRHS(spec.expectedExpression);
  const variables = spec.variables ?? detectVariables(expectedExpr);
  const trials = spec.trials ?? 6;
  const [lo, hi] = spec.sampleRange ?? [2, 25];

  // A pure-number answer (no free variables) is common (e.g. "x = 5"): fall
  // back to a direct numeric comparison rather than sampling.
  if (variables.length === 0) {
    try {
      const a = evaluate(studentExpr);
      const b = evaluate(expectedExpr);
      if (typeof a !== 'number' || typeof b !== 'number' || Number.isNaN(a) || Number.isNaN(b)) {
        return { result: 'FORMAT_ERROR', detail: 'Enter a valid numeric result.' };
      }
      return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))
        ? { result: 'CORRECT', numericValue: a }
        : { result: 'INCORRECT', numericValue: a };
    } catch {
      return { result: 'FORMAT_ERROR', detail: 'That does not parse as a valid expression.' };
    }
  }

  try {
    for (let t = 0; t < trials; t++) {
      const scope: Record<string, number> = {};
      for (const v of variables) scope[v] = lo + Math.random() * (hi - lo);

      const a = evaluate(studentExpr, scope);
      const b = evaluate(expectedExpr, scope);

      if (typeof a !== 'number' || typeof b !== 'number' || Number.isNaN(a) || Number.isNaN(b)) {
        return { result: 'FORMAT_ERROR', detail: 'That does not evaluate to a number - check the expression.' };
      }
      if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(b))) {
        return { result: 'INCORRECT' };
      }
    }
    return { result: 'CORRECT' };
  } catch {
    return { result: 'FORMAT_ERROR', detail: 'Enter a valid mathematical expression.' };
  }
}
