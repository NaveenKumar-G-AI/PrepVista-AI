// ============================================================================
// Maps a skill's latest confidence + adaptive signal to one of the four
// Phase 7 evidence states. This is the "what does the evidence itself say"
// read — separate from SkillCoverageEntry.status in coverage.ts, which asks
// "does this meet THIS BLUEPRINT's bar" (a target-relative question). The
// evidence state computed here is what actually gets sent to the Skill
// Signal Engine (Phase 44-45); coverage.status only drives when the
// interview itself decides it has asked enough.
// ============================================================================

import type { AdaptiveSignal, EvidenceState } from "../../domain/types.js";

export function deriveEvidenceState(confidence: number, latestSignal: AdaptiveSignal): EvidenceState {
  if (latestSignal === "CONTRADICTION") return "UNCERTAIN"; // never silently upgraded past uncertain (Phase 14)
  if (confidence >= 0.65 && latestSignal === "STRONG") return "VERIFIED";
  if (confidence >= 0.4) return "PARTIALLY_VERIFIED";
  return "UNCERTAIN";
}
