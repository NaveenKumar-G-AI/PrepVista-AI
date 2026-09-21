import { GapStatus, type ConsistencyResult, type MasteryLevel } from "./types.js";
import type { GapEngineConfig } from "./config.js";

/**
 * Implements Phase 9 (Gap Magnitude). Deterministic ordinal distance
 * between the required and verified current mastery level. Unassessed
 * skills report the full theoretical distance for informational/sorting
 * purposes only - the GapStatus (UNASSESSED) is what the UI and downstream
 * consumers must branch on, never this number in isolation (Phase 8).
 */
export function calculateGapMagnitude(
  current: MasteryLevel | null,
  target: MasteryLevel,
): number {
  if (current === null) return target;
  return Math.max(0, target - current);
}

/**
 * Implements Phase 7 (Gap Classification) and Phase 8 (Unassessed != Weak).
 *
 * Order of checks matters and is deliberate:
 *   1. No evidence at all -> UNASSESSED. Never 0, never "weak".
 *   2. Some evidence, but below the bar for a confident call ->
 *      INSUFFICIENT_EVIDENCE (Phase 25). This is a *lower* bar than a
 *      skill's full evidence requirements (which gate closure, not
 *      classification - see closureStateMachine.ts).
 *   3. Evidence exists and is sufficient, but too volatile to trust ->
 *      INCONSISTENT (Phase 19).
 *   4. Current already meets/exceeds target -> NO_GAP.
 *   5. A gap exists and is explained by an unresolved prerequisite ->
 *      DEPENDENCY_BLOCKED (Phase 21).
 *   6. Otherwise, magnitude decides PARTIAL vs BELOW_TARGET.
 */
export function classifyGap(params: {
  current: MasteryLevel | null;
  target: MasteryLevel;
  evidenceCount: number;
  consistency: ConsistencyResult;
  blockedByPrerequisite: boolean;
  config: GapEngineConfig;
}): GapStatus {
  const { current, target, evidenceCount, consistency, blockedByPrerequisite, config } = params;

  if (evidenceCount === 0 || current === null) {
    return GapStatus.UNASSESSED;
  }

  if (evidenceCount < config.minEvidenceForConfidentClassification) {
    return GapStatus.INSUFFICIENT_EVIDENCE;
  }

  if (consistency.status === "INCONSISTENT") {
    return GapStatus.INCONSISTENT;
  }

  const magnitude = Math.max(0, target - current);

  if (magnitude === 0) {
    return GapStatus.NO_GAP;
  }

  if (blockedByPrerequisite) {
    return GapStatus.DEPENDENCY_BLOCKED;
  }

  return magnitude <= config.partialGapThreshold ? GapStatus.PARTIAL : GapStatus.BELOW_TARGET;
}
