import { ComplexityInput, Finding } from '../types';
import { DuplicationMatch } from './duplication';
import { RULE_DIMENSIONS } from '../config';

let counter = 0;

/**
 * This module does NOT implement complexity analysis — Feature 17 is the trusted source
 * for that. `complexity` here is exactly the shape Feature 17 is expected to hand off
 * (time/space complexity, dominant cost, constraint fit, confidence, evidence). In this
 * standalone build there is no live Feature 17 to call, so callers pass this in as an
 * optional input; wire it to the real Feature 17 service's output when integrating.
 *
 * Quality != performance: an inefficient algorithm only becomes a QUALITY finding here
 * when it (a) demonstrably exceeds the problem's stated constraints, per Feature 17, AND
 * (b) correlates with actual duplicated logic — i.e. there's a maintainability angle, not
 * just "this is O(n^2)". An O(n^2) solution that fits its constraints is not penalized.
 */
export function evaluateComplexityQuality(complexity: ComplexityInput | undefined, duplication: DuplicationMatch[], ruleVersion: string): Finding[] {
  if (!complexity) return [];
  const looksInefficient = /n\^?2|n2\b|n\s*\*\s*n|2\^n|exponential/i.test(complexity.timeComplexity);
  if (!(looksInefficient && complexity.constraintFit === 'EXCEEDS' && duplication.length > 0)) return [];

  counter++;
  return [
    {
      findingId: `complexity_quality_${counter}`,
      ruleId: 'INEFFICIENT_COMPLEXITY_WITH_DUPLICATION',
      ruleVersion,
      category: 'STRUCTURAL_QUALITY',
      severity: 'MEDIUM',
      confidence: complexity.confidence === 'HIGH' ? 'MEDIUM' : 'LOW',
      title: `Repeated work compounds a ${complexity.timeComplexity} complexity that exceeds the problem's constraints`,
      description: `Feature 17 reports ${complexity.timeComplexity} time complexity that does not fit the stated constraints, and duplicated logic was also detected in this submission.`,
      impact: "Beyond the performance concern (already reported separately), the duplication means fixing the inefficiency requires updating logic in more than one place.",
      sourceLocation: null,
      evidence: [`time_complexity=${complexity.timeComplexity}`, `constraint_fit=${complexity.constraintFit}`, `duplicated_regions=${duplication.length}`],
      suggestedAction: 'Consider extracting the repeated computation into a single helper before addressing the algorithmic complexity.',
      dimensions: RULE_DIMENSIONS.INEFFICIENT_COMPLEXITY_WITH_DUPLICATION || {},
      origin: 'DETERMINISTIC',
    },
  ];
}
