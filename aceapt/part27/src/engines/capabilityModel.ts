/**
 * Unified current-capability view (spec section 10).
 *
 * Deliberately thin: this does NOT compute mastery/retention/transfer/etc.
 * scores. Those already exist elsewhere in ACEAPT (the mastery system,
 * Feature 24 Retention, Feature 25 Transfer, attempt tracking). This module's
 * only job is to assemble what the PlatformEvidenceGateway hands back into
 * one labeled snapshot, and — separately — to collapse it into a single
 * display number when the UI needs one big headline figure. The multi-
 * dimensional detail is what actually drives gaps/risk/forecast; the single
 * number is a display convenience computed at the edge, never the other way
 * around (section 11: "Do not reduce the entire model to one number internally").
 */
import type {
  CapabilityDimensionKey,
  CapabilityDimensionValue,
  CapabilitySnapshot,
  DimensionLabel,
} from "../domain/types.js";
import { clamp } from "../utils/format.js";

export interface DimensionEvidenceInput {
  key: CapabilityDimensionKey;
  /** 0-100, already computed upstream. */
  latestValue: number;
  observationCount: number;
  lastUpdated: string;
}

const MIN_OBSERVATIONS_FOR_LABEL = 3;
const STRONG_THRESHOLD = 80;
const MODERATE_THRESHOLD = 60;

function labelForValue(value: number, observationCount: number): DimensionLabel {
  if (observationCount < MIN_OBSERVATIONS_FOR_LABEL) return "INSUFFICIENT_DATA";
  if (value >= STRONG_THRESHOLD) return "STRONG";
  if (value >= MODERATE_THRESHOLD) return "MODERATE";
  return "NEEDS_ATTENTION";
}

export function buildCapabilitySnapshot(
  studentId: string,
  inputs: DimensionEvidenceInput[],
  asOf: string = new Date().toISOString(),
): CapabilitySnapshot {
  const dimensions: CapabilitySnapshot["dimensions"] = {};
  for (const input of inputs) {
    const value = clamp(input.latestValue);
    const entry: CapabilityDimensionValue = {
      key: input.key,
      value,
      label: labelForValue(value, input.observationCount),
      observationCount: input.observationCount,
      lastUpdated: input.lastUpdated,
    };
    dimensions[input.key] = entry;
  }
  return { studentId, dimensions, asOf };
}

/**
 * Collapses the dimension snapshot into one 0-100 "overall readiness" number
 * for display (the big number in the hero card, section 45). Equal-weighted
 * average of dimensions with enough evidence to count, by default — this is
 * a genuine product/learning-science decision the spec leaves open, not a
 * fact. Pass `weights` to override once real product input exists on which
 * dimensions should matter most for a given target/exam.
 */
export function computeOverallReadiness(
  capability: CapabilitySnapshot,
  weights?: Partial<Record<CapabilityDimensionKey, number>>,
): { value: number; dimensionsCounted: number } {
  let weightedSum = 0;
  let weightTotal = 0;
  let counted = 0;
  for (const dim of Object.values(capability.dimensions)) {
    if (!dim || dim.label === "INSUFFICIENT_DATA") continue;
    const w = weights?.[dim.key] ?? 1;
    weightedSum += dim.value * w;
    weightTotal += w;
    counted += 1;
  }
  if (weightTotal === 0) return { value: 0, dimensionsCounted: 0 };
  return { value: clamp(weightedSum / weightTotal), dimensionsCounted: counted };
}
