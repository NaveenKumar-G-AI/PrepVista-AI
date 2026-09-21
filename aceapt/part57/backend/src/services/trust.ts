import type { TrustState } from '../domain/enums';

/**
 * Configurable thresholds for the personal trust state machine (secs. 54-55,
 * 189-190, 248). Nothing here is fabricated: a shortcut only reaches
 * TRUSTED after enough *recorded* uses clear both the sample-size and
 * accuracy bars, and only counts as time-saving when it is actually faster
 * than the student's own comparable-difficulty baseline (sec. 43).
 */
export const TRUST_THRESHOLDS = {
  MIN_USES_FOR_RELIABLE: 5,
  MIN_USES_FOR_TRUSTED: 10,
  MIN_ACCURACY_RELIABLE: 0.8,
  MIN_ACCURACY_TRUSTED: 0.9,
  MIN_TIME_SAVED_RATIO_TRUSTED: 0.1,
  REGRESSION_WINDOW: 5,
  REGRESSION_ACCURACY_FLOOR: 0.6,
};

export interface UsageSummary {
  usageCount: number;
  successCount: number;
  accuracy: number;
  avgTimeSavedRatio: number | null;
  /** Accuracy over just the most recent REGRESSION_WINDOW usages, or null if too few. */
  recentWindowAccuracy: number | null;
  previousState: TrustState;
}

export interface TrustOutcome {
  state: TrustState;
  regressed: boolean;
}

export function computeTrustState(s: UsageSummary): TrustOutcome {
  const t = TRUST_THRESHOLDS;

  // A shortcut that was RELIABLE/TRUSTED but has recently degraded gets
  // flagged rather than left silently trusted (sec. 56, "Shortcut regression").
  if (
    (s.previousState === 'TRUSTED' || s.previousState === 'RELIABLE') &&
    s.recentWindowAccuracy !== null &&
    s.recentWindowAccuracy < t.REGRESSION_ACCURACY_FLOOR
  ) {
    return { state: 'NEEDS_REVIEW', regressed: true };
  }

  // Once under review, it has to earn a clean recent window back before it
  // is allowed to count as RELIABLE again - no silent auto-recovery.
  if (s.previousState === 'NEEDS_REVIEW') {
    if (s.recentWindowAccuracy !== null && s.recentWindowAccuracy >= t.MIN_ACCURACY_RELIABLE) {
      return { state: 'RELIABLE', regressed: false };
    }
    return { state: 'NEEDS_REVIEW', regressed: false };
  }

  if (
    s.usageCount >= t.MIN_USES_FOR_TRUSTED &&
    s.accuracy >= t.MIN_ACCURACY_TRUSTED &&
    (s.avgTimeSavedRatio ?? 0) >= t.MIN_TIME_SAVED_RATIO_TRUSTED
  ) {
    return { state: 'TRUSTED', regressed: false };
  }

  if (s.usageCount >= t.MIN_USES_FOR_RELIABLE && s.accuracy >= t.MIN_ACCURACY_RELIABLE) {
    return { state: 'RELIABLE', regressed: false };
  }

  if (s.usageCount > 0) {
    return { state: 'DEVELOPING' as TrustState, regressed: false };
  }

  return { state: 'EXPERIMENTAL', regressed: false };
}
