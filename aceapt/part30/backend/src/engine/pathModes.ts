import type { PathMode } from "../domain/types.js";
import type { CapabilityGap } from "./gapAnalysis.js";
import type { RiskCandidate } from "./riskEngine.js";

/**
 * Section 19. Recomputed fresh on every recalculation rather than stored
 * as sticky state -- a student in Recovery exits it the moment the
 * triggering evidence (repeated failure / stalling) clears, with no
 * separate "graduation" step required. Priority order matters: a
 * deteriorating student in a time crunch is still in Recovery, not Fast
 * Track -- stabilizing comes first.
 */
export function selectMode(
  risks: RiskCandidate[],
  deadlineDays: number | null,
  gaps: CapabilityGap[],
  readiness: number,
  targetReadiness: number
): { mode: PathMode; reason: string } {
  const hasHigh = (t: string) => risks.some((r) => r.type === t && r.severity === "HIGH");

  if (hasHigh("REPEATED_FAILURE") || hasHigh("STALLING")) {
    return {
      mode: "RECOVERY",
      reason: hasHigh("REPEATED_FAILURE")
        ? "Repeated failed attempts detected -- stepping down complexity to rebuild before pushing forward again."
        : "Readiness has stalled across recent recalculations -- stepping back to rebuild momentum before continuing.",
    };
  }

  const lowEvidenceShare = gaps.length > 0 ? gaps.filter((g) => !g.evidenceSufficient).length / gaps.length : 0;
  if (lowEvidenceShare >= 0.5) {
    return {
      mode: "REASSESSMENT",
      reason: "Most target requirements don't yet have enough evidence to plan a reliable route -- prioritizing assessment over further practice.",
    };
  }

  const distance = Math.max(0, targetReadiness - readiness);
  if (deadlineDays != null && deadlineDays <= 21 && distance > 5) {
    return {
      mode: "FAST_TRACK",
      reason: `${deadlineDays} days remain with ${distance.toFixed(0)} readiness points to close -- focusing only on the highest-impact gaps.`,
    };
  }

  if ((deadlineDays == null || deadlineDays >= 60) && distance <= 15 && risks.every((r) => r.severity !== "HIGH")) {
    return {
      mode: "DEEP_MASTERY",
      reason: "Core requirements are close to met with no deadline pressure -- building deeper, more resilient capability rather than stopping at the bar.",
    };
  }

  return { mode: "STANDARD", reason: "Balanced preparation across open gaps." };
}
