import type { EvidenceRequirement, MilestoneStatus, PathMilestone, StudentCapabilityState } from "../domain/types.js";

export interface MilestoneEvaluation {
  status: MilestoneStatus;
  readyToProve: boolean; // Section 35: evidence requirements met, [PROVE MILESTONE] should show
  unmetRequirements: EvidenceRequirement[];
}

/**
 * Section 7-8: a milestone only moves because of accuracy/speed/transfer/
 * consistency/level evidence crossing an explicit threshold with enough
 * observations behind it -- never because a lesson was opened or a video
 * finished. VERIFIED/MASTERED are left untouched here on purpose: they are
 * set only by an explicit proof event (Section 35) or the mastery check
 * (Section 15), never inferred from the latest snapshot, so a durable
 * "the student proved this" fact can't be silently reverted by one bad
 * attempt. Regression after verification is a risk signal (Section 26),
 * not an un-verification.
 */
export function evaluateUnlockedMilestone(
  milestone: PathMilestone,
  states: StudentCapabilityState[]
): MilestoneEvaluation {
  if (milestone.status === "VERIFIED" || milestone.status === "MASTERED") {
    return { status: milestone.status, readyToProve: false, unmetRequirements: [] };
  }

  const byCapability = new Map(states.map((s) => [s.capabilityCode, s]));
  const unmet: EvidenceRequirement[] = [];
  let anyEvidence = false;
  let anyRegression = false;

  for (const req of milestone.evidenceRequirements) {
    const state = byCapability.get(req.capabilityCode);
    if (!state) {
      unmet.push(req);
      continue;
    }
    if (state.evidenceCount > 0) anyEvidence = true;

    const observed = req.dimension === "level" ? state.level : state[req.dimension];
    const meetsValue = observed >= req.minValue;
    const meetsCount = state.evidenceCount >= req.minEvidenceCount;

    if (!meetsValue || !meetsCount) {
      unmet.push(req);
      // A requirement that has enough evidence but has fallen below the
      // bar (as opposed to never having reached it) reads as regression,
      // not first-attempt progress.
      if (meetsCount && !meetsValue && milestone.status !== "AVAILABLE") {
        anyRegression = true;
      }
    }
  }

  if (unmet.length === 0) {
    return { status: milestone.status === "LOCKED" ? "AVAILABLE" : milestone.status, readyToProve: true, unmetRequirements: [] };
  }
  if (anyRegression) {
    return { status: "NEEDS_IMPROVEMENT", readyToProve: false, unmetRequirements: unmet };
  }
  if (anyEvidence) {
    return { status: "IN_PROGRESS", readyToProve: false, unmetRequirements: unmet };
  }
  return { status: "AVAILABLE", readyToProve: false, unmetRequirements: unmet };
}

/** Section 15: success-aware upgrade from VERIFIED to MASTERED once the student is well past the bar. */
export function checkForMastery(
  milestone: PathMilestone,
  states: StudentCapabilityState[],
  masteryBuffer = 15
): boolean {
  if (milestone.status !== "VERIFIED") return false;
  const byCapability = new Map(states.map((s) => [s.capabilityCode, s]));
  return milestone.evidenceRequirements.every((req) => {
    const state = byCapability.get(req.capabilityCode);
    if (!state) return false;
    const observed = req.dimension === "level" ? state.level : state[req.dimension];
    return observed >= Math.min(100, req.minValue + masteryBuffer) && state.consistency >= 70;
  });
}
