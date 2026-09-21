import { EscalationRule, IncidentTemplate } from "./types";

/**
 * Escalation is derived, not stored-and-trusted: given the current sim
 * time and whether the incident has been mitigated, this always resolves
 * to the same level for the same inputs (brief: reproducibility). Called
 * after every action that advances the sim clock (see
 * repo/executeAction.ts) so instance.escalation_level stays in sync
 * without needing its own background job or timer.
 */
export function resolveEscalationLevel(template: IncidentTemplate, simMinutesElapsed: number, mitigated: boolean): number {
  if (mitigated) return 0;
  let level = 0;
  for (const rule of template.escalationRules) {
    if (simMinutesElapsed >= rule.afterMinutesWithoutMitigation) level += 1;
  }
  return level;
}

export function activeEscalationRules(template: IncidentTemplate, simMinutesElapsed: number, mitigated: boolean): EscalationRule[] {
  if (mitigated) return [];
  return template.escalationRules.filter((r) => simMinutesElapsed >= r.afterMinutesWithoutMitigation);
}
