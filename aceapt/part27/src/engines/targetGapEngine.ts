import type { CapabilitySnapshot, GapItem, ReadinessTarget } from "../domain/types.js";
import { CAPABILITY_DIMENSIONS } from "../domain/constants.js";
import { round } from "../utils/format.js";

/** Current vs target per dimension. Only emits a GapItem for dimensions that
 * have both a current value and a configured target (section 11). */
export function computeGaps(capability: CapabilitySnapshot, target: ReadinessTarget): GapItem[] {
  const gaps: GapItem[] = [];
  for (const dimension of CAPABILITY_DIMENSIONS) {
    const current = capability.dimensions[dimension];
    const targetValue = target.targetDimensions[dimension];
    if (current == null || targetValue == null) continue;
    gaps.push({
      dimension,
      current: round(current.value),
      target: round(targetValue),
      gap: round(targetValue - current.value),
    });
  }
  return gaps;
}

/** Top N dimensions the student is behind on, ranked by gap size (section 32
 * feeds off this, but this function alone is just the raw ranking — "highest
 * impact" also weighs risk severity, see riskEngine.determineMainFactor). */
export function identifyPrimaryGaps(gaps: GapItem[], topN = 3): GapItem[] {
  return [...gaps]
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, topN);
}
