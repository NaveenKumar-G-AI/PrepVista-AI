import { ClosureState, GapStatus } from "./types.js";
import type { GapEngineConfig } from "./config.js";

/**
 * Implements Phase 27 (Gap Closure), Phase 28 (Gap Closure Rule), and
 * Phase 29 (Gap Reopening).
 *
 * Deliberately separate from GapStatus: a skill can be classified NO_GAP
 * (current mastery already meets the target) while its ClosureState is
 * still NEARLY_CLOSED, if the *evidence conditions* required to durably
 * certify the gap closed (minimum count, diversity, recency - Phase 28)
 * haven't been met yet. Meeting the bar once is not the same as having
 * demonstrated it enough to certify it.
 *
 * Transition summary:
 *   no evidence                              -> UNASSESSED
 *   meets target AND evidence conditions met  -> CLOSED
 *   was CLOSED, no longer meets the bar       -> REOPENED (history preserved
 *                                                by the caller, never erased)
 *   small remaining magnitude                 -> NEARLY_CLOSED
 *   previously assessed, not yet closed       -> IN_PROGRESS
 *   otherwise                                 -> OPEN
 */
export function nextClosureState(params: {
  previousState: ClosureState | null;
  gapStatus: GapStatus;
  meetsTarget: boolean;
  evidenceConditionsMet: boolean;
  gapMagnitude: number;
  config: GapEngineConfig;
}): { state: ClosureState; reason: string } {
  const { previousState, gapStatus, meetsTarget, evidenceConditionsMet, gapMagnitude, config } = params;

  if (gapStatus === GapStatus.UNASSESSED) {
    return { state: ClosureState.UNASSESSED, reason: "No meaningful evidence recorded yet." };
  }

  if (meetsTarget && evidenceConditionsMet) {
    return {
      state: ClosureState.CLOSED,
      reason:
        previousState === ClosureState.CLOSED
          ? "Verified capability continues to meet the role requirement."
          : "Verified capability now meets the role requirement with sufficient supporting evidence.",
    };
  }

  if (previousState === ClosureState.CLOSED) {
    return {
      state: ClosureState.REOPENED,
      reason: "New verified evidence indicates capability no longer meets the role requirement.",
    };
  }

  if (gapMagnitude <= config.nearlyClosedMagnitudeThreshold) {
    return { state: ClosureState.NEARLY_CLOSED, reason: "Very close to the required level; limited evidence or magnitude remains." };
  }

  if (previousState !== null && previousState !== ClosureState.OPEN && previousState !== ClosureState.UNASSESSED) {
    return { state: ClosureState.IN_PROGRESS, reason: "Gap has been previously assessed and is not yet closed." };
  }

  return { state: ClosureState.OPEN, reason: "Gap identified; no meaningful progress recorded yet." };
}
