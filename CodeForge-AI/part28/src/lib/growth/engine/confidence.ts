import type { ConfidenceFactors, ConfidenceResult, GrowthEvidence } from "../types.ts";
import { GrowthConfig } from "../config.ts";
import { daysAgo, distinctChallengeFamilies, mean, outcomeVariance } from "../utils.ts";

/**
 * Computes aggregate confidence for a set of evidence about ONE dimension.
 * This is deliberately separate from state detection: confidence answers
 * "how much should we trust this conclusion", state answers "what is the
 * conclusion" — conflating them is how you get overconfident dashboards.
 */
export function computeConfidence(evidence: GrowthEvidence[], now: Date = new Date()): ConfidenceResult {
  const cfg = GrowthConfig.confidence;

  if (evidence.length === 0) {
    return {
      level: "INSUFFICIENT",
      score: 0,
      factors: {
        evidenceCount: 0,
        distinctChallengeFamilies: 0,
        recencyDays: Number.POSITIVE_INFINITY,
        consistency: 0,
        hasTransferEvidence: false,
        meanSourceConfidence: 0,
      },
    };
  }

  const families = distinctChallengeFamilies(evidence);
  const mostRecentDays = Math.min(...evidence.map((e) => daysAgo(e.occurredAt, now)));
  const variance = outcomeVariance(evidence);
  const consistency = Math.max(0, 1 - variance * 4); // variance maxes at 0.25 for binary outcomes
  const hasTransfer = evidence.some((e) => e.isTransfer);
  const meanSourceConfidence = mean(evidence.map((e) => e.sourceConfidence));

  const countFactor = Math.min(1, evidence.length / GrowthConfig.confidence.saturatingEvidenceCount);
  const diversityFactor = Math.min(1, families / GrowthConfig.diversity.minFamiliesForDiverse);
  const recencyFactor = mostRecentDays <= 14 ? 1 : mostRecentDays <= 45 ? 0.6 : 0.25;
  const transferBonus = hasTransfer ? 1 : 0;

  const rawScore =
    cfg.weights.evidenceCount * countFactor +
    cfg.weights.diversity * diversityFactor +
    cfg.weights.recency * recencyFactor +
    cfg.weights.consistency * consistency +
    cfg.weights.transferBonus * transferBonus;

  // Source reliability tempers the whole score — evidence from low-confidence
  // upstream analysis can't produce a high-confidence growth conclusion.
  const score = Math.max(0, Math.min(1, rawScore * (0.5 + 0.5 * meanSourceConfidence)));

  const level =
    score >= cfg.thresholds.high
      ? "HIGH"
      : score >= cfg.thresholds.medium
        ? "MEDIUM"
        : score >= cfg.thresholds.low
          ? "LOW"
          : "INSUFFICIENT";

  const factors: ConfidenceFactors = {
    evidenceCount: evidence.length,
    distinctChallengeFamilies: families,
    recencyDays: Math.round(mostRecentDays),
    consistency: Number(consistency.toFixed(2)),
    hasTransferEvidence: hasTransfer,
    meanSourceConfidence: Number(meanSourceConfidence.toFixed(2)),
  };

  return { level, score: Number(score.toFixed(3)), factors };
}
