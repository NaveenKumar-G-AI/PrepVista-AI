import type { SkillEvidence } from '../types/evidence.js';
import type { RetentionState, SkillStateLabel } from '../types/skill-state.js';
import { growthRules } from '../config/growth-rules.js';

/**
 * Retention Intelligence (section 25). Time-since-last-demonstration is
 * the primary signal, but a skill that was reached with a stronger,
 * better-corroborated state decays more slowly than one that was only
 * just reached — this is the concrete, evidence-grounded way this module
 * honors "do not assume inactivity automatically means forgetting"
 * (section 25) without inventing external signals (vacations, course
 * load, ...) it has no access to. That caveat is real: this function only
 * ever sees CodeForge activity, so a long gap it can't otherwise explain
 * is reported as REQUIRES_REINFORCEMENT / LOST_CONFIDENCE, not as a
 * certainty that the student forgot.
 */

const RETENTION_MULTIPLIER: Partial<Record<SkillStateLabel, number>> = {
  MASTERED: 1.5,
  PROFICIENT: 1.2,
  PRACTICED: 1.0,
  RECOVERING: 0.9,
  DEVELOPING: 0.8,
};

export function computeRetentionState(evidence: SkillEvidence[], nowIso: string, currentBaseState: SkillStateLabel): RetentionState {
  if (currentBaseState === 'UNKNOWN' || currentBaseState === 'INTRODUCED') return 'UNKNOWN';
  if (evidence.length === 0) return 'UNKNOWN';

  const mostRecent = evidence.reduce((latest, e) => (new Date(e.timestamp).getTime() > new Date(latest.timestamp).getTime() ? e : latest));
  const daysSinceLast = (new Date(nowIso).getTime() - new Date(mostRecent.timestamp).getTime()) / 86_400_000;

  const multiplier = RETENTION_MULTIPLIER[currentBaseState] ?? 1.0;
  const { staleAfterDays, atRiskAfterDays, reinforcementRequiredAfterDays } = growthRules.retention;

  if (daysSinceLast < staleAfterDays * multiplier) return 'RETAINED';
  if (daysSinceLast < atRiskAfterDays * multiplier) return 'AT_RISK';
  if (daysSinceLast < reinforcementRequiredAfterDays * multiplier) return 'REQUIRES_REINFORCEMENT';
  return 'LOST_CONFIDENCE';
}
