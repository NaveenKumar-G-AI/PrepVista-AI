import { create, all } from "mathjs";

/**
 * spec §39 explicitly forbids treating an LLM prompt as mathematical truth, but
 * says nothing about trusting the EXPRESSION STRINGS authors/AI-generation put
 * in `derivation.expression` either — and per spec §79/§80, AI-generated and
 * imported content is untrusted until validated. mathjs's documented security
 * guidance is to disable `import` and `createUnit` before evaluating untrusted
 * expression strings (both are genuine escape hatches to the surrounding JS
 * environment); this is that hardened instance — every validator evaluates
 * through THIS, never through a bare `import("mathjs").evaluate(...)`.
 */
// `all` is always defined at runtime (confirmed: 362 factory functions); mathjs's
// own .d.ts just declares it as possibly-undefined via a destructuring pattern.
const safeMath = create(all!, {});

safeMath.import(
  {
    import: function () {
      throw new Error("Function import is disabled for untrusted question content");
    },
    createUnit: function () {
      throw new Error("Function createUnit is disabled for untrusted question content");
    }
    // NOTE (real bug found via testing, see TRUTH_TABLE.md): earlier drafts of this
    // file also overrode `evaluate`, `parse`, `simplify`, and `derivative`, following
    // fairly common (if imprecise) mathjs-hardening advice floating around online.
    // That broke this module's OWN legitimate `safeMath.evaluate(...)` calls below,
    // because a mathjs instance's top-level `.evaluate()` API and the in-expression
    // `evaluate(...)` function share the SAME function-registry entry — overriding
    // one overrides the other. `import` and `createUnit` do not have this collision
    // (nothing here needs to call them), so they're the only two disabled.
  },
  { override: true }
);

export interface SafeEvalResult {
  ok: true;
  value: number;
}
export interface SafeEvalError {
  ok: false;
  error: string;
}

const MAX_EXPRESSION_LENGTH = 500;

/** Evaluates `expression` against `scope` and coerces the result to a plain number.
 *  Never throws — callers get a discriminated result instead, since a bad author
 *  expression is CONTENT to report on, not a reason to crash the validator. */
export function safeEvaluate(expression: string, scope: Record<string, number> = {}): SafeEvalResult | SafeEvalError {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    return { ok: false, error: `Expression exceeds ${MAX_EXPRESSION_LENGTH} characters — refusing to evaluate.` };
  }
  try {
    const raw = safeMath.evaluate(expression, { ...scope });
    const value = typeof raw === "object" && raw !== null && "toNumber" in raw ? (raw as { toNumber: () => number }).toNumber() : Number(raw);
    if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
      return { ok: false, error: `Expression did not evaluate to a finite number (got ${JSON.stringify(raw)}).` };
    }
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? String(err) };
  }
}

export function numbersWithinTolerance(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

export const DEFAULT_TOLERANCE = 1e-6;
