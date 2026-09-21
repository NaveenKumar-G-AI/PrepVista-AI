import type { ReadinessState, TransitionResult } from "../domain/types.js";

const DISPLAY_NAMES: Record<ReadinessState, string> = {
  NOT_ENOUGH_EVIDENCE: "Not enough evidence",
  DEVELOPING: "Developing",
  AT_RISK: "At risk",
  IMPROVING: "Improving",
  ON_TRACK: "On track",
  TARGET_REACHED: "Target reached",
  STABLE: "Stable",
};

export function humanizeReadinessState(state: ReadinessState): string {
  return DISPLAY_NAMES[state];
}

/** Notable pairs get a richer, still-honest explanation (never asserting a
 * cause beyond what the transition itself shows); everything else gets a
 * plain, factual "moved from X to Y." */
const NOTABLE_TRANSITIONS: Partial<Record<string, string>> = {
  "AT_RISK->IMPROVING": "Recent evidence shows a meaningful improvement in trajectory.",
  "AT_RISK->ON_TRACK": "Recent evidence shows the trajectory has caught up to what the target requires.",
  "ON_TRACK->AT_RISK": "Recent evidence suggests the current trajectory may no longer be enough to reach the target — worth a closer look.",
  "IMPROVING->AT_RISK": "Recent evidence suggests progress has slowed or reversed relative to what's needed.",
  "DEVELOPING->AT_RISK": "Enough evidence has now accumulated to flag the current trajectory as insufficient for the target.",
  "NOT_ENOUGH_EVIDENCE->DEVELOPING": "Enough evidence has now accumulated to start tracking a trajectory.",
  "IMPROVING->ON_TRACK": "The trajectory has closed the gap to target within the projected range.",
  "AT_RISK->STABLE": "Performance has stabilized at target level.",
};

export function detectTransition(previousStatus: ReadinessState | null, currentStatus: ReadinessState): TransitionResult {
  if (previousStatus == null) return { changed: false, explanation: null };
  if (previousStatus === currentStatus) return { changed: false, explanation: null };
  const key = `${previousStatus}->${currentStatus}`;
  const notable = NOTABLE_TRANSITIONS[key];
  const explanation =
    notable ?? `Readiness status moved from ${humanizeReadinessState(previousStatus)} to ${humanizeReadinessState(currentStatus)}.`;
  return { changed: true, explanation };
}
