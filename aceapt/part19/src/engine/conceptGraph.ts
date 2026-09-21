// ============================================================================
// Concept dependency propagation.
//
// "Weak Ratio → potential weak Profit/Loss." When a prerequisite's risk
// rises, this only *flags* dependents for closer monitoring — it never
// silently downgrades a dependent's confirmed state. Downstream concepts
// still have to fail their own evidence checks to actually regress.
// ============================================================================

import { RetentionRiskState } from '../domain/types';
import { ConceptDependencyRepository } from '../repositories/ports';

export interface PropagationResult {
  conceptId: string;
  suggestedAction: 'include_in_next_mixed_check';
  reason: string;
}

const RISK_TRIGGERS: RetentionRiskState[] = ['WEAKENING', 'AT_RISK', 'REACTIVATION_REQUIRED', 'INACCESSIBLE'];

export async function propagatePrerequisiteRisk(
  conceptId: string,
  riskState: RetentionRiskState,
  deps: ConceptDependencyRepository
): Promise<PropagationResult[]> {
  if (!RISK_TRIGGERS.includes(riskState)) return [];
  const dependents = await deps.getDependents(conceptId);
  return dependents.map(depId => ({
    conceptId: depId,
    suggestedAction: 'include_in_next_mixed_check',
    reason: `Prerequisite "${conceptId}" is ${riskState.toLowerCase().replace(/_/g, ' ')}.`,
  }));
}
