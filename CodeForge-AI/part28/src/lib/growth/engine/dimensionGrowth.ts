import type { DimensionGrowth, GrowthDimension, GrowthEvidence, TimeWindow } from "../types.ts";
import { detectDimensionState } from "./stateDetection.ts";
import { computeConfidence } from "./confidence.ts";
import { analyzeTransfer } from "./transfer.ts";
import { analyzeRetention } from "./retention.ts";
import { analyzeIndependence } from "./independence.ts";
import { sortByOccurredAt } from "../utils.ts";

/**
 * Builds the full growth picture for a single dimension. `allDimensionEvidence`
 * should be every piece of evidence CodeForge has for this student+dimension —
 * state detection does its own internal windowing (baseline vs recent), so
 * pre-filtering to a narrow window here would break its ability to see a
 * baseline at all. `outerWindow` is only used to label the result and to cap
 * which evidence ids are eligible to show up as "supporting evidence" for
 * time-window-scoped views (e.g. "what changed in the last 30 days").
 */
export function buildDimensionGrowth(
  dimension: GrowthDimension,
  allDimensionEvidence: GrowthEvidence[],
  outerWindow: TimeWindow,
  options: { now?: Date; previousState?: import("../types.ts").GrowthState | null } = {},
): DimensionGrowth {
  const now = options.now ?? new Date();
  const stateResult = detectDimensionState(allDimensionEvidence, { now, previousState: options.previousState });
  const confidence = computeConfidence(allDimensionEvidence, now);
  const transfer = analyzeTransfer(allDimensionEvidence);
  const retention = analyzeRetention(allDimensionEvidence, now);
  const independence = analyzeIndependence(allDimensionEvidence, now);

  const sorted = sortByOccurredAt(allDimensionEvidence);
  const supportingEvidenceIds = sorted
    .slice(-8) // most recent 8 — enough for a real drill-down, never "all of it"
    .map((e) => e.evidenceId);

  return {
    dimension,
    state: stateResult.state,
    trend: stateResult.trend,
    confidence,
    baselineState: stateResult.baselineState,
    evidenceWindow: outerWindow,
    evidenceCount: allDimensionEvidence.length,
    transferEvidenceCount: transfer.transferEvidenceCount,
    retentionEvidenceCount: retention.retentionEvidenceCount,
    independenceTrend: independence.trend,
    supportingEvidenceIds,
    velocity: stateResult.velocity,
  };
}
