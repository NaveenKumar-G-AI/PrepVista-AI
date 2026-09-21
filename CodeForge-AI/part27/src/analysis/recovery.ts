import type { SkillEvidence } from '../types/evidence.js';
import type { SkillStateLabel } from '../types/skill-state.js';
import { growthRules } from '../config/growth-rules.js';

/**
 * Recovery Detection (section 24). Only ever evaluated when the student's
 * last recorded state was itself a decline state — recovery is defined
 * relative to a documented dip, never as a generic "things are going well"
 * signal (that's just IMPROVING/RAPIDLY_IMPROVING trajectory).
 */

export interface RecoveryResult {
  isRecovering: boolean;
  isFullyRecovered: boolean;
  positiveStreak: number;
}

const DECLINE_STATES: SkillStateLabel[] = ['AT_RISK', 'REGRESSING', 'RECOVERING'];

export function detectRecovery(evidence: SkillEvidence[], previousState: SkillStateLabel): RecoveryResult {
  if (!DECLINE_STATES.includes(previousState)) {
    return { isRecovering: false, isFullyRecovered: false, positiveStreak: 0 };
  }

  const sortedDesc = [...evidence].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  let positiveStreak = 0;
  for (const e of sortedDesc) {
    if (e.outcome === 'positive') positiveStreak += 1;
    else break;
  }

  const { minPositiveEvidenceAfterDecline, minPositiveRatioAfterDecline } = growthRules.recovery;
  const consideredSlice = sortedDesc.slice(0, Math.max(minPositiveEvidenceAfterDecline, positiveStreak));
  const positiveRatio = consideredSlice.length > 0 ? consideredSlice.filter((e) => e.outcome === 'positive').length / consideredSlice.length : 0;

  const isFullyRecovered = positiveStreak >= minPositiveEvidenceAfterDecline && positiveRatio >= minPositiveRatioAfterDecline;
  const isRecovering = isFullyRecovered || positiveStreak >= 1;

  return { isRecovering, isFullyRecovered, positiveStreak };
}
