/**
 * Scenario engine (sections 35-37). A scenario is explicitly an illustrative
 * projection under stated assumptions, never a guarantee — confidence is
 * always downgraded at least one notch from the base forecast confidence,
 * and every result carries a disclaimer. Observed data and scenario
 * projections are never merged into the same number (section 37).
 */
import type {
  CapabilityDimensionKey,
  ConfidenceLevel,
  ForecastRange,
  ScenarioAssumptions,
  ScenarioResult,
} from "../domain/types.js";
import { clamp, round } from "../utils/format.js";

/** Rough, clearly-labeled heuristic: how many points/week one extra focused
 * session tends to move the needle. Calibrate with real outcome data before
 * relying on this for anything beyond an illustrative "what if". */
const POINTS_PER_SESSION_PER_WEEK = 0.8;
const SCENARIO_EXTRA_BAND = 2;

export const PRESET_SCENARIOS: ScenarioAssumptions[] = [
  { label: "Continue current routine", weeklyFocusedSessionsDelta: 0 },
  { label: "Focused routine", weeklyFocusedSessionsDelta: 4 },
  { label: "Assessment-focused routine", weeklyFocusedSessionsDelta: 3 },
  { label: "Reduced practice", weeklyFocusedSessionsDelta: -2 },
];

const CONFIDENCE_DOWNGRADE: Record<ConfidenceLevel, ConfidenceLevel> = {
  HIGH: "MEDIUM",
  MEDIUM: "LOW",
  LOW: "INSUFFICIENT",
  INSUFFICIENT: "INSUFFICIENT",
};

export interface RunScenarioInput {
  current: number;
  observedSlopePerWeek: number;
  weeksRemaining: number;
  baseConfidence: ConfidenceLevel;
  baseBand: number; // points, taken from the base forecast's uncertainty band
  assumptions: ScenarioAssumptions;
}

export function runScenario(input: RunScenarioInput): ScenarioResult {
  const { current, observedSlopePerWeek, weeksRemaining, baseConfidence, baseBand, assumptions } = input;
  const effectiveSlope = observedSlopePerWeek + assumptions.weeklyFocusedSessionsDelta * POINTS_PER_SESSION_PER_WEEK;
  const projectedMid = clamp(current + effectiveSlope * weeksRemaining);
  const band = assumptions.weeklyFocusedSessionsDelta === 0 ? baseBand : baseBand + SCENARIO_EXTRA_BAND;

  const low = clamp(round(projectedMid - band));
  const high = clamp(round(projectedMid + band));
  const confidence = assumptions.weeklyFocusedSessionsDelta === 0 ? baseConfidence : CONFIDENCE_DOWNGRADE[baseConfidence];

  return {
    label: assumptions.label,
    assumptions,
    projectedRange: { low: Math.min(low, high), high: Math.max(low, high) },
    primaryImprovementArea: assumptions.focusDimension ?? null,
    confidence,
    disclaimer: "Illustrative projection based on stated assumptions, not a guarantee.",
  };
}

export function runPresetScenarios(
  input: Omit<RunScenarioInput, "assumptions">,
  topGapDimension: CapabilityDimensionKey | null,
): ScenarioResult[] {
  return PRESET_SCENARIOS.map((preset) => {
    const assumptions: ScenarioAssumptions =
      preset.label === "Focused routine" ? { ...preset, focusDimension: topGapDimension } : preset;
    return runScenario({ ...input, assumptions });
  });
}

export function forecastRangeToBand(range: ForecastRange, mid: number): number {
  return Math.max(range.high - mid, mid - range.low, 1);
}
