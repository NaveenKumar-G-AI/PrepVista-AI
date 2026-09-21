import { evaluate } from 'mathjs';

/**
 * Evaluates a math expression against a scope of variables. Used only for
 * numeric shortcut/formula comparison (sec. 22-24) - never for anything
 * that touches user-controlled *code*, just arithmetic expressions over a
 * fixed variable scope. mathjs's `evaluate` does not grant filesystem/
 * network/process access, which is what makes it safe to run here.
 */
export function evalExpr(expression: string, scope: Record<string, number>): number {
  const result = evaluate(expression, { ...scope });
  if (typeof result !== 'number' || Number.isNaN(result) || !Number.isFinite(result)) {
    throw new Error(`Expression "${expression}" did not evaluate to a finite number for scope ${JSON.stringify(scope)}`);
  }
  return result;
}

export function safeEvalExpr(expression: string, scope: Record<string, number>): number | null {
  try {
    return evalExpr(expression, scope);
  } catch {
    return null;
  }
}
