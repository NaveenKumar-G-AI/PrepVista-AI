import { ReadinessGap, ReadinessState } from '../types/domain';

/**
 * Flags when a student already has enough evidence to test a role but keeps
 * consuming low-stakes preparation activity anyway. This is a nudge, never
 * a block — the student decides what to do with it.
 */
export function detectOverPreparation(state: ReadinessState, recentLowValueActivityCount: number): string | null {
  const isReady = state === 'READY_TO_TEST' || state === 'STRONG_EVIDENCE';
  if (isReady && recentLowValueActivityCount >= 3) {
    return 'Current evidence is already sufficient to begin testing this role. Additional preparation may provide less value right now than real-world validation.';
  }
  return null;
}

/**
 * Flags when a student appears to be applying despite a major, core gap.
 * Never blocks the application — only surfaces the gap so the decision is
 * informed.
 */
export function detectUnderPreparation(gaps: ReadinessGap[]): string | null {
  const majorGap = gaps.find((g) => g.importance === 3 && g.distance >= 2);
  if (majorGap) {
    return `You can apply, but current evidence shows a significant gap in ${majorGap.capabilityName}, a core requirement for this role.`;
  }
  return null;
}
