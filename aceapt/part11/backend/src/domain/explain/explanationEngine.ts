import { BehaviorSignal } from '../../types/signals';
import { LearningBehaviorProfile } from '../../types/profile';

/**
 * Composes evidence-grounded narrative that spans MULTIPLE signals -
 * individual signals already carry their own explanation (see
 * types/signals.ts), this module is only for the composite views:
 * the plan-change transparency panel (section 39) and a one-line profile
 * summary. Every sentence produced here is built from fields already
 * present on a signal's supportingMetrics/explanation - nothing here
 * invents a new number.
 */
export function buildPlanChangeReasons(triggeringSignals: BehaviorSignal[]): string[] {
  return triggeringSignals.filter((s) => s.status === 'ACTIVE').map((s) => s.explanation);
}

export function buildProfileSummary(profile: LearningBehaviorProfile): string {
  if (profile.isColdStart) {
    return 'Learning behavior profile is still developing - keep practicing and this page will fill in.';
  }
  const strongCount = Object.values(profile.dimensions).filter((d) => d.level === 'STRONG').length;
  const lowCount = Object.values(profile.dimensions).filter((d) => d.level === 'LOW').length;
  if (lowCount === 0 && strongCount >= 4) {
    return 'Your recent preparation pattern looks solid across most measured areas.';
  }
  if (lowCount >= 3) {
    return 'A few areas of your preparation pattern could use attention - see below for specifics.';
  }
  return 'Your preparation pattern is mixed - strong in some areas, developing in others.';
}
