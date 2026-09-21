import type { Bottleneck, Capability, CapabilityDimensions, StudentCapabilityState, TargetRequirement } from "../domain/types.js";
import { type CapabilityGap, computeGaps, topGap } from "./gapAnalysis.js";

const DIMENSION_LABELS: Record<keyof CapabilityDimensions, string> = {
  accuracy: "conceptual accuracy",
  speed: "timed application",
  transfer: "transfer to novel problems",
  consistency: "consistency across attempts",
};

/**
 * Section 11 (CURRENT BOTTLENECK) + Section 21 (readiness dimensions).
 * Given the top-severity gap, decides which of the four evidence
 * dimensions is most responsible and writes the evidence-backed
 * explanation the UI shows verbatim. Never invents a bottleneck when
 * there isn't reliable evidence for one -- see Section 53.
 */
export function identifyBottleneck(
  requirements: TargetRequirement[],
  states: StudentCapabilityState[],
  capabilities: Capability[]
): { bottleneck: Bottleneck | null; gaps: CapabilityGap[] } {
  const gaps = computeGaps(requirements, states);
  const gap = topGap(gaps.filter((g) => g.evidenceSufficient));

  if (!gap) {
    return { bottleneck: null, gaps };
  }

  const state = states.find((s) => s.capabilityCode === gap.capabilityCode);
  const capability = capabilities.find((c) => c.code === gap.capabilityCode);
  if (!state || !capability) return { bottleneck: null, gaps };

  const dims: (keyof CapabilityDimensions)[] = ["accuracy", "speed", "transfer", "consistency"];
  const worst = dims.reduce((worstKey, key) =>
    state[key] < state[worstKey] ? key : worstKey
  , dims[0]);

  const explanation =
    `Your target requires ${capability.name} at ${gap.requiredLevel.toFixed(0)}. ` +
    `Your ${DIMENSION_LABELS.accuracy} is ${state.accuracy.toFixed(0)} and your ${DIMENSION_LABELS.transfer} is ${state.transfer.toFixed(0)}, ` +
    `but your ${DIMENSION_LABELS[worst]} is ${state[worst].toFixed(0)} -- that is what is holding your overall level at ${state.level.toFixed(0)}.`;

  const bottleneck: Bottleneck = {
    capabilityCode: capability.code,
    capabilityName: capability.name,
    dimension: worst,
    currentValue: state[worst],
    targetRequirement: gap.requiredLevel,
    gap: gap.gap,
    evidence: {
      accuracy: state.accuracy,
      speed: state.speed,
      transfer: state.transfer,
      consistency: state.consistency,
      evidenceCount: state.evidenceCount,
    },
    explanation,
  };

  return { bottleneck, gaps };
}
