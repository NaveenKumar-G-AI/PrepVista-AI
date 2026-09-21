import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { NoveltyLevel } from "../types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MasteryModelConfig {
  version: string;
  dimensionWeights: {
    concept: number;
    execution: number;
    transfer: number;
    retention: number;
    timed: number;
    consistency: number;
  };
  transferWeights: { direct: number; variation: number; novel: number };
  thresholds: {
    learningToImproving: { trendMin: number };
    provisional: { conceptMin: number; executionMin: number; minPracticeEvidence: number };
    verified: { transferMin: number; minTransferEvidence: number; minNoveltyLevel: NoveltyLevel };
    stable: { consistencyMin: number; retentionMin: number; minVerificationAttempts: number; minDelayedEvidence: number };
    atRisk: { dropFromSnapshot: number };
    regressed: { dropFromSnapshot: number };
  };
  consistency: { windowSize: number; maxAcceptableStdDev: number };
  retention: { riskSlopePerDay: number; minDelayedPointsForTrend: number };
  recency: { halfLife: number };
  review: {
    stableIntervalDays: number;
    verifiedIntervalDays: number;
    provisionalIntervalDays: number;
    atRiskIntervalDays: number;
    maxQueueSizePerStudent: number;
  };
  exposure: { memorizationRiskAfterExactRepeats: number };
}

let cached: MasteryModelConfig | null = null;

/**
 * Loads the versioned, configurable mastery-model thresholds (spec section
 * 21/22 - "the exact thresholds must be configurable... do not hardcode
 * arbitrary values throughout the application"). Every service that needs a
 * threshold reads it from here, never as a literal in the middle of logic.
 * If the model changes, bump `version` in the JSON - it's stamped onto every
 * mastery_state row so historical results stay interpretable under the model
 * version that produced them.
 */
export function getMasteryModelConfig(): MasteryModelConfig {
  if (cached) return cached;
  const raw = readFileSync(path.join(__dirname, "mastery-model-config.json"), "utf-8");
  cached = JSON.parse(raw) as MasteryModelConfig;
  return cached;
}
