import type { AccuracyProfileEntry } from "../types/domain.js";

const MIN_PER_SPEED_BUCKET = 3;
const FAST_RATIO_CUTOFF = 0.75;

export interface AccuracyResponsePoint {
  isCorrect: boolean;
  durationMs: number;
  expectedDurationMs: number;
}

/** Module 19 example: "Accuracy drops when you answer quickly." */
export function computeAccuracyProfile(scopeNodeId: string, responses: AccuracyResponsePoint[]): AccuracyProfileEntry {
  if (responses.length === 0) {
    return { scopeNodeId, accuracy: 0 };
  }

  const accuracy = Number((responses.filter((r) => r.isCorrect).length / responses.length).toFixed(2));

  const fast = responses.filter((r) => r.expectedDurationMs > 0 && r.durationMs / r.expectedDurationMs < FAST_RATIO_CUTOFF);
  const slow = responses.filter((r) => r.expectedDurationMs > 0 && r.durationMs / r.expectedDurationMs >= FAST_RATIO_CUTOFF);

  const speedConditionedAccuracy =
    fast.length >= MIN_PER_SPEED_BUCKET && slow.length >= MIN_PER_SPEED_BUCKET
      ? {
          fastAccuracy: Number((fast.filter((r) => r.isCorrect).length / fast.length).toFixed(2)),
          slowAccuracy: Number((slow.filter((r) => r.isCorrect).length / slow.length).toFixed(2)),
        }
      : undefined;

  return { scopeNodeId, accuracy, speedConditionedAccuracy };
}
