import type { SpeedProfileEntry } from "../types/domain.js";

const MIN_EVIDENCE = 3;
const FAST_BAND = 0.75;
const SLOW_BAND = 1.3;

export interface SpeedResponsePoint {
  durationMs: number;
  expectedDurationMs: number;
}

export function computeSpeedProfile(scopeNodeId: string, responses: SpeedResponsePoint[]): SpeedProfileEntry {
  if (responses.length < MIN_EVIDENCE) {
    return { scopeNodeId, averageDurationMs: 0, averageExpectedRatio: 0, label: "insufficient_evidence" };
  }

  const averageDurationMs = Math.round(responses.reduce((s, r) => s + r.durationMs, 0) / responses.length);
  const averageExpectedRatio = Number(
    (
      responses.reduce((s, r) => s + (r.expectedDurationMs > 0 ? r.durationMs / r.expectedDurationMs : 1), 0) /
      responses.length
    ).toFixed(2),
  );

  const label: SpeedProfileEntry["label"] =
    averageExpectedRatio < FAST_BAND ? "fast" : averageExpectedRatio > SLOW_BAND ? "slow" : "on_pace";

  return { scopeNodeId, averageDurationMs, averageExpectedRatio, label };
}
