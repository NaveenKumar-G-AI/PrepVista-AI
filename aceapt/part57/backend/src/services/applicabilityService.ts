import type { ConditionRule, QuestionContext } from '../domain/types';
import type { ApplicabilityResult } from '../domain/enums';

function getField(ctx: QuestionContext, field: string): unknown {
  if (ctx.attributes && field in ctx.attributes) return ctx.attributes[field];
  return (ctx as unknown as Record<string, unknown>)[field];
}

/** Returns true/false, or null when the question context doesn't say. */
function evalRule(rule: ConditionRule, ctx: QuestionContext): boolean | null {
  const value = getField(ctx, rule.field);
  if (value === undefined) return null;
  switch (rule.op) {
    case 'eq':
      return value === rule.value;
    case 'neq':
      return value !== rule.value;
    case 'in':
      return Array.isArray(rule.value) && (rule.value as unknown[]).includes(value);
    case 'not_in':
      return Array.isArray(rule.value) && !(rule.value as unknown[]).includes(value);
    case 'exists':
      return value !== undefined && value !== null;
    case 'gt':
      return typeof value === 'number' && value > (rule.value as number);
    case 'gte':
      return typeof value === 'number' && value >= (rule.value as number);
    case 'lt':
      return typeof value === 'number' && value < (rule.value as number);
    case 'lte':
      return typeof value === 'number' && value <= (rule.value as number);
    case 'range': {
      const [lo, hi] = rule.value as [number, number];
      return typeof value === 'number' && value >= lo && value <= hi;
    }
    default:
      return null;
  }
}

function describeRule(rule: ConditionRule): string {
  return rule.label ?? `${rule.field} ${rule.op} ${JSON.stringify(rule.value)}`;
}

export interface ApplicabilityInput {
  conditions: ConditionRule[];
  nonApplicability: ConditionRule[];
  requiresOptions: boolean;
  isApproximation: boolean;
  acceptableError?: number | null;
}

export interface ApplicabilityOutcome {
  result: ApplicabilityResult;
  reasons: string[];
}

/**
 * The Applicability Engine (sec. 34). Order of checks matters and is
 * deliberate: hard structural mismatches (needs options / needs an exact
 * answer) are decided first and always win, explicit non-applicability
 * rules are checked next (sec. 25, "where does it fail"), then declared
 * conditions, and only a clean pass through everything with no ambiguity
 * counts as APPLICABLE. Approximation methods land on
 * CONDITIONALLY_APPLICABLE even when every condition matches, because
 * they're only safe within their stated error tolerance (secs. 107-108).
 */
export function evaluateApplicability(shortcut: ApplicabilityInput, ctx: QuestionContext): ApplicabilityOutcome {
  const reasons: string[] = [];

  if (shortcut.requiresOptions && ctx.hasOptions === false) {
    return {
      result: 'NOT_APPLICABLE',
      reasons: ['This method relies on eliminating or testing answer options, and this question has none (sec. 109-110).'],
    };
  }

  if (shortcut.isApproximation && ctx.answerType === 'EXACT') {
    return {
      result: 'NOT_APPLICABLE',
      reasons: ['This method approximates the answer, and this question requires an exact value (sec. 107-108).'],
    };
  }

  for (const rule of shortcut.nonApplicability) {
    if (evalRule(rule, ctx) === true) {
      return { result: 'NOT_APPLICABLE', reasons: [`Explicitly does not apply: ${describeRule(rule)}`] };
    }
  }

  let anyUnknown = false;
  for (const rule of shortcut.conditions) {
    const outcome = evalRule(rule, ctx);
    if (outcome === null) {
      anyUnknown = true;
      continue;
    }
    if (outcome === false) {
      return { result: 'NOT_APPLICABLE', reasons: [`Condition not met: ${describeRule(rule)}`] };
    }
  }

  if (anyUnknown) {
    return {
      result: 'UNKNOWN',
      reasons: ['Not enough information about this question to confirm every condition - treat as unverified until checked.'],
    };
  }

  if (shortcut.isApproximation) {
    return {
      result: 'CONDITIONALLY_APPLICABLE',
      reasons: [`Conditions match, but this is an approximation - only safe within its stated tolerance${shortcut.acceptableError != null ? ` (~${shortcut.acceptableError})` : ''}.`],
    };
  }

  reasons.push(shortcut.conditions.length > 0 ? 'All stated conditions are satisfied.' : 'No conditions declared for this method.');
  return { result: 'APPLICABLE', reasons };
}
