import type { MasteryEvidence } from "../types/index.js";
import { recencyWeightedMean, stddev, clamp } from "../utils/stats.js";
import { getMasteryModelConfig } from "../config/masteryModel.js";

function usable(evidence: MasteryEvidence[]): MasteryEvidence[] {
  return evidence.filter((e) => e.questionExposureState !== "MEMORIZATION_RISK");
}

/** Concept: can the student get the right answer at all, under familiar
 *  conditions? This is the "did they learn the idea" signal - not yet
 *  concerned with novelty, speed, or repeatability. */
export function computeConceptScore(evidence: MasteryEvidence[]): { score: number | null; count: number } {
  const config = getMasteryModelConfig();
  const relevant = usable(evidence).filter((e) => e.evidenceType === "PRACTICE" || e.evidenceType === "ASSESSMENT");
  if (relevant.length === 0) return { score: null, count: 0 };
  return { score: recencyWeightedMean(relevant.map((e) => e.score), config.recency.halfLife), count: relevant.length };
}

/** Execution: can they reliably carry out the procedure across the easier
 *  novelty tiers (familiar + slightly-variant), independent of raw recall. */
export function computeExecutionScore(evidence: MasteryEvidence[]): { score: number | null; count: number } {
  const config = getMasteryModelConfig();
  const relevant = usable(evidence).filter(
    (e) => (e.evidenceType === "PRACTICE" || e.evidenceType === "VARIATION") &&
           (e.noveltyLevel === "FAMILIAR" || e.noveltyLevel === "SLIGHTLY_VARIANT")
  );
  if (relevant.length === 0) return { score: null, count: 0 };
  return { score: recencyWeightedMean(relevant.map((e) => e.score), config.recency.halfLife), count: relevant.length };
}

/**
 * Timed: distinguishes "knowledge retained" from "timed performance
 * weakness" (spec section 17). A correct-but-slow answer counts against
 * this score even though it counts fully toward conceptScore - that
 * asymmetry is the whole point of tracking it separately. Faster-than-
 * expected is capped at 1.0 rather than rewarded, so racing through
 * carelessly can't inflate the score.
 */
export function computeTimedScore(evidence: MasteryEvidence[]): { score: number | null; count: number } {
  const config = getMasteryModelConfig();
  const relevant = usable(evidence).filter((e) => e.timed && e.expectedTimeSeconds && e.timeTakenSeconds);
  if (relevant.length === 0) return { score: null, count: 0 };
  const componentScores = relevant.map((e) => {
    const timeRatio = clamp((e.expectedTimeSeconds as number) / Math.max(1, e.timeTakenSeconds as number), 0, 1);
    return e.score * timeRatio;
  });
  return { score: recencyWeightedMean(componentScores, config.recency.halfLife), count: relevant.length };
}

/**
 * Consistency: variance across the most recent verification-relevant
 * attempts. One lucky attempt is never enough evidence of stability (spec
 * section 18) - a student who scores 94/61/89 is NOT stable even though
 * their mean is fine, and this is what catches that.
 */
export function computeConsistencyScore(evidence: MasteryEvidence[]): { score: number | null; count: number; stdDev: number | null } {
  const config = getMasteryModelConfig();
  const relevant = usable(evidence)
    .filter((e) => e.evidenceType === "VARIATION" || e.evidenceType === "TRANSFER" || e.evidenceType === "MIXED_CONTEXT")
    .slice(-config.consistency.windowSize);
  if (relevant.length < 2) return { score: null, count: relevant.length, stdDev: null };
  const sd = stddev(relevant.map((e) => e.score));
  const score = clamp(1 - sd / config.consistency.maxAcceptableStdDev, 0, 1);
  return { score, count: relevant.length, stdDev: sd };
}
