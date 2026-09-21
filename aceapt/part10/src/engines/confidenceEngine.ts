import { THRESHOLDS } from '../config/thresholds';
import { ConfidenceResult } from '../types';

export interface ConfidenceInputs {
  evidenceCount: number;
  mostRecentEvidenceDaysAgo: number | null;
  volatilityCV: number | null; // lower = more consistent
  distinctSkillsCovered: number;
  expectedSkillsCovered: number;
}

/**
 * SS14 Mastery Confidence, SS36 Forecast Confidence.
 * Not every score deserves equal trust. Confidence is a weighted blend
 * of how much evidence exists, how recent it is, how consistent it's
 * been, and how many distinct skills/areas it covers - never a single
 * score standing in for the whole picture.
 */
export function computeConfidence(inputs: ConfidenceInputs): ConfidenceResult {
  const cfg = THRESHOLDS.confidence;

  if (inputs.evidenceCount < cfg.minEvidenceForLow) {
    return {
      level: 'INSUFFICIENT_EVIDENCE',
      score: null,
      inputs: { evidenceCount: inputs.evidenceCount, recencyScore: 0, consistencyScore: 0, diversityScore: 0 },
    };
  }

  const volumeScore = Math.min(1, inputs.evidenceCount / cfg.minEvidenceForHigh);

  const recencyScore =
    inputs.mostRecentEvidenceDaysAgo === null
      ? 0.5
      : Math.exp((-Math.LN2 * inputs.mostRecentEvidenceDaysAgo) / cfg.recencyHalfLifeDays);

  const consistencyScore =
    inputs.volatilityCV === null ? 0.5 : Math.max(0, 1 - Math.min(1, inputs.volatilityCV / 0.3));

  const diversityScore =
    inputs.expectedSkillsCovered > 0
      ? Math.min(1, inputs.distinctSkillsCovered / inputs.expectedSkillsCovered)
      : 0.5;

  const score =
    volumeScore * cfg.volumeWeight +
    recencyScore * cfg.recencyWeight +
    consistencyScore * cfg.consistencyWeight +
    diversityScore * cfg.diversityWeight;

  let level: ConfidenceResult['level'];
  if (inputs.evidenceCount >= cfg.minEvidenceForHigh && score >= 0.7) level = 'HIGH';
  else if (inputs.evidenceCount >= cfg.minEvidenceForMedium && score >= 0.45) level = 'MEDIUM';
  else level = 'LOW';

  return {
    level,
    score: Number(score.toFixed(3)),
    inputs: {
      evidenceCount: inputs.evidenceCount,
      recencyScore: Number(recencyScore.toFixed(3)),
      consistencyScore: Number(consistencyScore.toFixed(3)),
      diversityScore: Number(diversityScore.toFixed(3)),
    },
  };
}
