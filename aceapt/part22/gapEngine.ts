import { CapabilityKey, GapAnalysis, GapStatus, GoalRequirement, StudentState } from "../types";

const GAP_TOLERANCE = 2; // within 2 points of target counts as AT_TARGET, not a gap

/**
 * Section 12: compute current vs target for every requirement. Missing
 * evidence produces an UNKNOWN gap with confidence 0 — never a silent 0.
 */
export function computeGaps(state: StudentState, requirements: GoalRequirement[]): GapAnalysis[] {
  return requirements.map((req) => {
    const reading = state.capabilities[req.metric as CapabilityKey];

    if (!reading || reading.value === null) {
      return {
        metric: req.metric,
        current: null,
        target: req.targetValue,
        delta: null,
        status: "UNKNOWN" as GapStatus,
        confidence: 0,
        weight: req.weight,
      };
    }

    const delta = reading.value - req.targetValue;
    let status: GapStatus;
    if (Math.abs(delta) <= GAP_TOLERANCE) status = "AT_TARGET";
    else if (delta > 0) status = "ABOVE_TARGET";
    else status = "GAP";

    return {
      metric: req.metric,
      current: reading.value,
      target: req.targetValue,
      delta,
      status,
      confidence: reading.confidence,
      weight: req.weight,
    };
  });
}

/**
 * Section 12's core insight: "the student does not need broad learning,
 * they need transfer + timed execution." Ranks only the actual gaps, by
 * weighted, confidence-adjusted deficit, largest first.
 */
export function rankGapsByWeightedDeficit(gaps: GapAnalysis[]): GapAnalysis[] {
  return [...gaps]
    .filter((g) => g.status === "GAP")
    .sort((a, b) => {
      const deficitA = Math.abs(a.delta ?? 0) * a.weight * a.confidence;
      const deficitB = Math.abs(b.delta ?? 0) * b.weight * b.confidence;
      return deficitB - deficitA;
    });
}
