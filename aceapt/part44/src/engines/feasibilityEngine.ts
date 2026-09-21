// Deterministic feasibility assessment (Section 24). This is explicitly
// NOT a prediction of placement/job-offer success - only whether the
// available time is realistically enough to close the priority gaps.
import type { AvailableTime, GoalFeasibility, PriorityScoreBreakdown } from "../domain/types.js";

const ON_TRACK_RATIO = 1.3;
const CHALLENGING_RATIO = 0.7;
const TOP_N_TARGETS = 3;

export interface FeasibilityEngineInput {
  ranked: PriorityScoreBreakdown[];
  /** dimension/target -> hours needed per point of gap, i.e. 1/rate.
   * Only present for targets with real improvement-rate evidence. */
  gapsByTarget: Record<string, number>; // target -> remaining gap
  hoursPerPointByTarget: Record<string, number | null>; // null = no evidence
  availableTime: AvailableTime;
  daysRemaining: number | null;
}

export interface FeasibilityResult {
  feasibility: GoalFeasibility;
  reason: string;
  requiredHours: number | null;
  availableHours: number | null;
}

export function computeFeasibility(input: FeasibilityEngineInput): FeasibilityResult {
  if (input.daysRemaining === null) {
    return {
      feasibility: null,
      reason: "This goal has no deadline, so time-based feasibility does not apply.",
      requiredHours: null,
      availableHours: null,
    };
  }

  const topTargets = input.ranked
    .filter((r) => (input.gapsByTarget[r.target] ?? 0) > 0)
    .slice(0, TOP_N_TARGETS);

  const withEvidence = topTargets.filter(
    (r) => input.hoursPerPointByTarget[r.target] != null
  );

  if (topTargets.length === 0) {
    return {
      feasibility: null,
      reason: "No remaining gap to evaluate feasibility against.",
      requiredHours: null,
      availableHours: null,
    };
  }

  if (withEvidence.length === 0) {
    return {
      feasibility: "INSUFFICIENT_EVIDENCE",
      reason:
        "Not enough practice history yet to estimate how quickly these skills improve, so preparation time can't be assessed yet.",
      requiredHours: null,
      availableHours: null,
    };
  }

  const requiredHours = round2(
    withEvidence.reduce((sum, r) => {
      const gap = input.gapsByTarget[r.target] ?? 0;
      const hoursPerPoint = input.hoursPerPointByTarget[r.target]!;
      return sum + gap * hoursPerPoint;
    }, 0)
  );

  const minutesPerWeek = Object.values(input.availableTime).reduce(
    (sum, m) => sum + (m ?? 0),
    0
  );
  const availableHours = round2((minutesPerWeek / 60) * (input.daysRemaining / 7));

  const ratio = requiredHours > 0 ? availableHours / requiredHours : Infinity;

  let feasibility: GoalFeasibility;
  let verdict: string;
  if (ratio >= ON_TRACK_RATIO) {
    feasibility = "ON_TRACK";
    verdict = "the available time comfortably covers the highest-priority gaps";
  } else if (ratio >= CHALLENGING_RATIO) {
    feasibility = "CHALLENGING";
    verdict = "the available time is close to what the highest-priority gaps are likely to need";
  } else {
    feasibility = "HIGHLY_CONSTRAINED";
    verdict = "the available time is well below what the highest-priority gaps are likely to need";
  }

  return {
    feasibility,
    reason: `Based on ${availableHours} available hour(s) over the remaining ${input.daysRemaining} day(s) against an estimated ${requiredHours} hour(s) needed for the current top priorities, ${verdict}.`,
    requiredHours,
    availableHours,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
