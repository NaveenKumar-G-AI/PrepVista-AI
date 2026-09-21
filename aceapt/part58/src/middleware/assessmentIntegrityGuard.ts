/**
 * Assessment integrity guard (§118, §130, §190-191, §213, §217).
 *
 * This is the single most important file in the module. The rule it enforces:
 * during a FORMAL_ASSESSMENT, this system must never expose a predicted
 * correct answer, an option ranking, a recommended action, an elimination
 * hint, or scoring advice — UNLESS the assessment's own policy explicitly
 * turns strategy assistance on (§118 "unless explicitly designed into
 * assessment").
 *
 * It's applied at two levels on purpose (defense in depth):
 *   1. `stripLiveCoachingFields` — a pure function, unit-testable in isolation,
 *      that redacts a fixed set of field names from any response payload.
 *   2. `assessmentIntegrityGuard` — Express middleware that wraps res.json so
 *      the stripping happens even if a route handler forgets to call the pure
 *      function directly.
 * Either layer failing does not defeat the other.
 */
import type { NextFunction, Request, Response } from 'express';
import type { DecisionContext, DecisionPolicy } from '../types';

export const BLOCKED_FIELDS_IN_FORMAL_ASSESSMENT = [
  'recommendedAction',
  'suggestedActions',
  'predictedCorrectOptionId',
  'optionRanking',
  'hint',
  'eliminationHint',
  'scoringAdvice',
  'coaching',
] as const;

function isRedactionRequired(context: DecisionContext | undefined, policy?: DecisionPolicy | null): boolean {
  if (context !== 'FORMAL_ASSESSMENT') return false;
  // Only an explicit, verified policy flag can turn this off (§118) — an
  // absent or UNKNOWN policy is treated as "no assistance allowed", not as
  // permission by default.
  return policy?.strategyAssistance !== 'FULL';
}

/**
 * Recursively strips blocked fields from a JSON-shaped payload. Recurses into
 * plain objects and arrays so a nested `{ event: { recommendedAction: ... } }`
 * is caught, not just top-level fields.
 */
export function stripLiveCoachingFields<T>(context: DecisionContext | undefined, payload: T, policy?: DecisionPolicy | null): T {
  if (!isRedactionRequired(context, policy)) return payload;
  return redactDeep(payload) as T;
}

function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !(BLOCKED_FIELDS_IN_FORMAL_ASSESSMENT as readonly string[]).includes(key)
    );
    return Object.fromEntries(entries.map(([key, v]) => [key, redactDeep(v)]));
  }
  return value;
}

/**
 * Express middleware: wraps res.json so every response from a route behind
 * this guard is checked, regardless of which service produced it. Reads the
 * decision context from the request body/query and an optional policy from
 * res.locals.policy (set by a route handler that already fetched it).
 */
export function assessmentIntegrityGuard(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const context = (req.body?.context ?? req.query?.context) as DecisionContext | undefined;
    const policy = res.locals.policy as DecisionPolicy | null | undefined;
    return originalJson(stripLiveCoachingFields(context, body, policy));
  }) as Response['json'];
  next();
}
