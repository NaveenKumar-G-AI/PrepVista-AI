import { masteryRank } from '../config';
import type { GapStatus, MasteryLevel, MasteryState } from '../domain/types';

/**
 * Classifies target requirement vs current evidence.
 *
 * Critical rule from the brief (Phase 6): a skill with zero evidence must
 * classify as UNKNOWN ("needs assessment"), never as a weak/gap status. This
 * matters because UNKNOWN and CRITICAL_GAP get very different treatment
 * downstream (exploration vs. remediation) even though both are "not done".
 */
export function classifyGap(state: MasteryState, targetMastery: MasteryLevel, required: boolean): GapStatus {
  if (state.evidenceCount === 0 || state.masteryLevel === null) {
    return 'UNKNOWN';
  }

  const currentRank = masteryRank(state.masteryLevel) as number;
  const targetRank = masteryRank(targetMastery) as number;

  if (currentRank >= targetRank) {
    // Rank alone can lie if it's backed by very little evidence at very low
    // confidence (e.g. one lucky success). Don't call that "complete".
    if (state.confidence < 0.35 && state.evidenceCount < 3) {
      return 'INSUFFICIENT_EVIDENCE';
    }
    return 'COMPLETE';
  }

  const diff = targetRank - currentRank;
  if (diff >= 2) return 'CRITICAL_GAP';
  // A one-level gap on a required skill is treated as an active GAP; on an
  // optional skill it's just DEVELOPING (present, not yet urgent).
  return required ? 'GAP' : 'DEVELOPING';
}

/**
 * Combines a skill's own gap classification with whether its prerequisites
 * are themselves ready. A skill whose prerequisites are not COMPLETE is
 * BLOCKED for *active scheduling* purposes even if its own gap looks
 * tractable — Phase 7: "before putting an advanced skill into the active
 * roadmap, check prerequisite readiness."
 */
export function resolveSchedulingStatus(ownGapStatus: GapStatus, prerequisitesReady: boolean): GapStatus {
  if (ownGapStatus === 'COMPLETE') return 'COMPLETE';
  if (!prerequisitesReady) return 'BLOCKED';
  return ownGapStatus;
}
