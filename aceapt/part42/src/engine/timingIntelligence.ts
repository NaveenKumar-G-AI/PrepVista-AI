import type { TimingClassification } from "../types/domain.js";

/**
 * Ratio bands, not absolute seconds — a 90s answer is "fast" on a question
 * expected to take 3 minutes and "slow" on one expected to take 20 seconds.
 * These are signals (Module 7 says so explicitly), not conclusions — nothing
 * here decides capability on its own; evidenceQuality.ts and
 * capabilityEstimator.ts are what turn a pattern of these into a claim.
 */
const FAST_RATIO = 0.6; // duration below 60% of expected
const SLOW_RATIO = 1.5; // duration above 150% of expected

export function classifyTiming(durationMs: number, expectedDurationMs: number, isCorrect: boolean | null): TimingClassification {
  if (isCorrect === null) return "skipped";

  const ratio = expectedDurationMs > 0 ? durationMs / expectedDurationMs : 1;

  if (ratio < FAST_RATIO) return isCorrect ? "fast_correct" : "fast_wrong";
  if (ratio > SLOW_RATIO) return isCorrect ? "slow_correct" : "slow_wrong";
  return isCorrect ? "expected_correct" : "expected_wrong";
}

export function durationRatio(durationMs: number, expectedDurationMs: number): number {
  return expectedDurationMs > 0 ? durationMs / expectedDurationMs : 1;
}

/**
 * A floor below which a response is not "fast thinking" but implausible —
 * e.g. answering a 45s-expected question in 900ms. Used by evidenceQuality
 * (down-weight) and questionIntegrity (flag), never to accuse, only to
 * mark the evidence as weaker.
 */
export function isImplausiblyFast(durationMs: number, expectedDurationMs: number): boolean {
  const floor = Math.min(2000, expectedDurationMs * 0.15);
  return durationMs < floor;
}
