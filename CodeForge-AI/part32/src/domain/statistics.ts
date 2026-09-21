import { GapTrend, type ConsistencyResult } from "./types.js";
import type { GapEngineConfig } from "./config.js";

/**
 * Consistency is deliberately judged on a RECENT window, not the full
 * history. A student who moved from weak to strong performance will show
 * high variance across their *entire* history even though they are, right
 * now, performing stably - that is an improving trend, not inconsistency.
 * Reversal/oscillation within the recent window is what Phase 19 means by
 * "inconsistent"; a clean historical sweep is what Phase 20 means by
 * "trend". The window size is tied to `minSampleForConsistencyCheck` so
 * there is one fewer knob to keep in sync.
 */
export function selectRecentScores(
  series: { timestamp: string; score: number }[],
  config: GapEngineConfig,
): number[] {
  const sorted = [...series].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const windowSize = Math.max(config.minSampleForConsistencyCheck, 1);
  return sorted.slice(-windowSize).map((s) => s.score);
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Implements Phase 19 (Consistency). Requires a minimum sample before
 * making any claim - an inadequate sample reports INSUFFICIENT_SAMPLE,
 * never a false CONSISTENT.
 */
export function detectConsistency(
  scores: number[],
  config: GapEngineConfig,
): ConsistencyResult {
  if (scores.length < config.minSampleForConsistencyCheck) {
    return { status: "INSUFFICIENT_SAMPLE", sampleSize: scores.length };
  }
  const avg = mean(scores);
  const sd = stdDev(scores, avg);
  return {
    status: sd > config.consistencyStdDevThreshold ? "INCONSISTENT" : "CONSISTENT",
    sampleSize: scores.length,
    mean: avg,
    stdDev: sd,
  };
}

/**
 * Implements Phase 20 (Gap Trend). A gap can still exist while a student is
 * improving - trend and gap status are computed and reported independently;
 * this function never suppresses or "closes" anything, it only classifies
 * direction.
 */
export function detectTrend(
  series: { timestamp: string; score: number }[],
  consistency: ConsistencyResult,
  config: GapEngineConfig,
): GapTrend {
  if (series.length < config.minSampleForConsistencyCheck) return GapTrend.UNKNOWN;

  if (
    consistency.status === "INCONSISTENT" &&
    (consistency.stdDev ?? 0) > config.volatilityStdDevThreshold
  ) {
    return GapTrend.VOLATILE;
  }

  const sorted = [...series].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);
  if (firstHalf.length === 0 || secondHalf.length === 0) return GapTrend.UNKNOWN;

  const delta = mean(secondHalf.map((e) => e.score)) - mean(firstHalf.map((e) => e.score));

  if (delta >= config.trendImprovingThreshold) return GapTrend.IMPROVING;
  if (delta <= -config.trendWorseningThreshold) return GapTrend.WORSENING;
  return GapTrend.STABLE;
}
