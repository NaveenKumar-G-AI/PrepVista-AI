import type { MasteryEvidence } from "../types/index.js";
import { recencyWeightedMean } from "../utils/stats.js";
import { getMasteryModelConfig } from "../config/masteryModel.js";

export interface TransferAssessment {
  transferScore: number | null;
  tierScores: { direct: number | null; variation: number | null; novel: number | null };
  novelEvidenceCount: number;
  totalTransferEvidenceCount: number;
}

/** Evidence tainted by exact-question memorization never counts as new
 *  understanding-transfer evidence (spec section 26). */
function usable(evidence: MasteryEvidence[]): MasteryEvidence[] {
  return evidence.filter((e) => e.questionExposureState !== "MEMORIZATION_RISK");
}

/**
 * Computes the transfer dimension (spec sections 11/16): can the student
 * apply the skill to surface structures they haven't drilled on, not just
 * repeat a memorized pattern? Deliberately keyed off `noveltyLevel`, not
 * `evidenceType` - "direct/variation/novel" is a statement about how
 * unfamiliar the question's surface form was, independent of which engine
 * produced the attempt.
 *
 * Tiers with no evidence are left out of the weighted combination (and their
 * weight is redistributed across tiers that DO have evidence) rather than
 * defaulting to 0 - a skill with zero novel-tier evidence yet should read as
 * "we don't know", not "transfer is bad".
 */
export function assessTransfer(evidence: MasteryEvidence[]): TransferAssessment {
  const config = getMasteryModelConfig();
  const clean = usable(evidence);

  const direct = clean.filter((e) => e.noveltyLevel === "FAMILIAR");
  const variation = clean.filter((e) => e.noveltyLevel === "SLIGHTLY_VARIANT");
  const novel = clean.filter((e) => e.noveltyLevel === "NOVEL" || e.noveltyLevel === "COMPLEX_APPLICATION");

  const tierScores = {
    direct: direct.length ? recencyWeightedMean(direct.map((e) => e.score), config.recency.halfLife) : null,
    variation: variation.length ? recencyWeightedMean(variation.map((e) => e.score), config.recency.halfLife) : null,
    novel: novel.length ? recencyWeightedMean(novel.map((e) => e.score), config.recency.halfLife) : null,
  };

  const weights = config.transferWeights;
  const available: Array<{ score: number; weight: number }> = [];
  if (tierScores.direct !== null) available.push({ score: tierScores.direct, weight: weights.direct });
  if (tierScores.variation !== null) available.push({ score: tierScores.variation, weight: weights.variation });
  if (tierScores.novel !== null) available.push({ score: tierScores.novel, weight: weights.novel });

  let transferScore: number | null = null;
  if (available.length > 0) {
    const totalWeight = available.reduce((sum, a) => sum + a.weight, 0);
    transferScore = available.reduce((sum, a) => sum + a.score * a.weight, 0) / totalWeight;
  }

  return {
    transferScore,
    tierScores,
    novelEvidenceCount: novel.length,
    totalTransferEvidenceCount: direct.length + variation.length + novel.length,
  };
}
