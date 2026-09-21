import type { FatigueSignals } from "../types/domain.js";
import { durationRatio, isImplausiblyFast } from "./timingIntelligence.js";

export interface FatigueResponsePoint {
  durationMs: number;
  expectedDurationMs: number;
  isCorrect: boolean | null;
}

const MIN_WINDOW = 6;
const ACCURACY_DROP_THRESHOLD = 0.3;
const TIME_TREND_THRESHOLD = 0.25;
const CONSECUTIVE_GUESS_THRESHOLD = 3;

/**
 * Module 34: signals only — "increasing response time, declining accuracy,
 * unusually fast random answers, excessive skipping." This never asserts
 * *why* (tiredness, distraction, disengagement) — only that evidence
 * quality from this point forward looks unreliable enough to suggest a
 * pause, which is a product decision, not a medical one.
 */
export function detectFatigue(recentResponses: FatigueResponsePoint[]): FatigueSignals & { fatigueLikely: boolean } {
  if (recentResponses.length < MIN_WINDOW) {
    return { consecutiveFastGuessLikeAnswers: 0, responseTimeTrend: "flat", recentAccuracyDrop: false, fatigueLikely: false };
  }

  const half = Math.floor(recentResponses.length / 2);
  const firstHalf = recentResponses.slice(0, half);
  const secondHalf = recentResponses.slice(half);

  const accuracyOf = (points: FatigueResponsePoint[]) => {
    const countable = points.filter((p) => p.isCorrect !== null);
    return countable.length > 0 ? countable.filter((p) => p.isCorrect).length / countable.length : 0;
  };
  const avgRatioOf = (points: FatigueResponsePoint[]) =>
    points.reduce((s, p) => s + durationRatio(p.durationMs, p.expectedDurationMs), 0) / points.length;

  const recentAccuracyDrop = accuracyOf(firstHalf) - accuracyOf(secondHalf) >= ACCURACY_DROP_THRESHOLD;

  const ratioShift = avgRatioOf(secondHalf) - avgRatioOf(firstHalf);
  const responseTimeTrend: FatigueSignals["responseTimeTrend"] =
    ratioShift > TIME_TREND_THRESHOLD ? "increasing" : ratioShift < -TIME_TREND_THRESHOLD ? "decreasing" : "flat";

  let consecutiveFastGuessLikeAnswers = 0;
  for (let i = recentResponses.length - 1; i >= 0; i--) {
    const r = recentResponses[i]!;
    if (isImplausiblyFast(r.durationMs, r.expectedDurationMs)) consecutiveFastGuessLikeAnswers++;
    else break;
  }

  const fatigueLikely =
    recentAccuracyDrop && (responseTimeTrend === "increasing" || consecutiveFastGuessLikeAnswers >= CONSECUTIVE_GUESS_THRESHOLD);

  return { consecutiveFastGuessLikeAnswers, responseTimeTrend, recentAccuracyDrop, fatigueLikely };
}
