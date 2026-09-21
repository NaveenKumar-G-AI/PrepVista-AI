import { Finding } from '../types';
import { RuleContext } from './types';
import { ALL_RULES } from './catalog';

export type { RuleContext } from './types';

export function runRules(ctx: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const rule of ALL_RULES) {
    try {
      findings.push(...rule(ctx));
    } catch (err) {
      // A single rule failing must not take down the whole report (safe partial-analysis
      // behavior) — record it as an INFO-level internal note instead of throwing.
      findings.push({
        findingId: `rule_error_${rule.name}_${Date.now()}`,
        ruleId: 'RULE_EXECUTION_ERROR',
        ruleVersion: ctx.ruleVersion,
        category: 'INTERNAL',
        severity: 'INFO',
        confidence: 'UNKNOWN',
        title: `Rule "${rule.name}" failed to execute`,
        description: 'This does not affect the reliability of the other findings in this report.',
        impact: 'None to the rest of the report.',
        sourceLocation: null,
        evidence: [String(err)],
        suggestedAction: 'No action needed.',
        dimensions: {},
        origin: 'DETERMINISTIC',
      });
    }
  }
  return findings;
}
