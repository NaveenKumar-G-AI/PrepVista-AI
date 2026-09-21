/**
 * Confidence calibration (§52-59, §165-166). Pure functions over
 * (confidence, outcome) pairs — Feature 34 supplies the confidence, Feature 58
 * only compares it against what actually happened.
 */
import type { ConfidenceBand, InsightConfidence } from '../types';
import { CONFIDENCE_BANDS } from '../types';
import { ILLUSTRATIVE_BAND_PROBABILITY_RANGE } from './expectedValue';

/** Illustrative default — do not treat as a validated psychometric threshold.
 *  §205: do not generate strong personal conclusions from one or two questions. */
export const MIN_SAMPLE_SIZE_FOR_CALIBRATION_INSIGHT = 8;

export interface CalibrationPoint {
  band: ConfidenceBand;
  isCorrect: boolean;
}

export interface BandObservation {
  accuracy: number; // 0-1
  sampleSize: number;
}

export function computeCalibrationByBand(
  points: CalibrationPoint[]
): Record<ConfidenceBand, BandObservation> {
  const result = Object.fromEntries(
    CONFIDENCE_BANDS.map((band) => [band, { accuracy: 0, sampleSize: 0 }])
  ) as Record<ConfidenceBand, BandObservation>;

  const correctCounts = Object.fromEntries(CONFIDENCE_BANDS.map((b) => [b, 0])) as Record<
    ConfidenceBand,
    number
  >;

  for (const point of points) {
    result[point.band].sampleSize += 1;
    if (point.isCorrect) correctCounts[point.band] += 1;
  }
  for (const band of CONFIDENCE_BANDS) {
    if (result[band].sampleSize > 0) {
      result[band].accuracy = correctCounts[band] / result[band].sampleSize;
    }
  }
  return result;
}

export type Misalignment = {
  band: ConfidenceBand;
  type: 'OVERCONFIDENT' | 'UNDERCONFIDENT';
  observedAccuracy: number;
  sampleSize: number;
  confidence: InsightConfidence;
};

/**
 * Flags bands where observed accuracy falls clearly outside the band's
 * expected range. Only evaluated for bands with enough samples — everything
 * else is silently skipped rather than guessed at.
 */
export function detectMisalignment(observed: Record<ConfidenceBand, BandObservation>): Misalignment[] {
  const out: Misalignment[] = [];
  for (const band of CONFIDENCE_BANDS) {
    const { accuracy, sampleSize } = observed[band];
    if (sampleSize < MIN_SAMPLE_SIZE_FOR_CALIBRATION_INSIGHT) continue;
    const [lo, hi] = ILLUSTRATIVE_BAND_PROBABILITY_RANGE[band];
    const insightConfidence: InsightConfidence = sampleSize >= 30 ? 'HIGH' : 'MEDIUM';
    if (accuracy * 100 < lo) {
      out.push({ band, type: 'OVERCONFIDENT', observedAccuracy: accuracy, sampleSize, confidence: insightConfidence });
    } else if (accuracy * 100 > hi) {
      out.push({ band, type: 'UNDERCONFIDENT', observedAccuracy: accuracy, sampleSize, confidence: insightConfidence });
    }
  }
  return out;
}
