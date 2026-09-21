import { calibrationConfig } from '../config/calibration.config.js';
import { twoProportionZTest } from '../lib/stats.js';
import type { AnomalyCandidate } from './difficulty-anomaly.service.js';
import type { DifficultyEstimator } from './difficulty-estimator.service.js';
import type { EligibleObservation } from '../types/difficulty.types.js';

export interface DriftBaseline {
  facility: number;
  sampleSize: number;
}

export interface DriftResult {
  driftDetected: boolean;
  pValue: number;
  z: number;
  baselineFacility: number;
  recentFacility: number;
  recentSampleSize: number;
  absoluteShift: number;
}

/**
 * §60-62, §185: is the recent window actually different from the historical
 * baseline, or is this noise? Uses a two-proportion z-test rather than "did
 * the category label change," because a category can flip from a facility
 * move of 0.01 sitting right on a threshold — that's not drift, it's
 * rounding. Both a significance test (p-value) AND a minimum absolute shift
 * are required, deliberately: statistically significant but trivially small
 * shifts (huge sample sizes make almost anything "significant") shouldn't
 * page a human either.
 *
 * Drift is a SIGNAL, not a verdict (§61) — this service does not decide
 * *why* the facility moved (new population, exposure, curriculum change,
 * genuine item decay). It only decides whether the shift is real enough to
 * be worth a human asking that question, which the caller then surfaces as
 * a DIFFICULTY_DRIFT anomaly for the review queue (§124-125, §169).
 */
export class DifficultyDriftService {
  constructor(private readonly estimator: DifficultyEstimator) {}

  evaluate(baseline: DriftBaseline, recentObservations: EligibleObservation[]): DriftResult {
    const recentFacilityEst = this.estimator.computeFacility(recentObservations);
    const baselineSuccesses = Math.round(baseline.facility * baseline.sampleSize);
    const recentSuccesses = Math.round(recentFacilityEst.facility * recentFacilityEst.sampleSize);

    const { z, pValue } = twoProportionZTest(
      baselineSuccesses,
      baseline.sampleSize,
      recentSuccesses,
      recentFacilityEst.sampleSize
    );

    const absoluteShift = Math.abs(recentFacilityEst.facility - baseline.facility);
    const driftDetected =
      recentFacilityEst.sampleSize >= calibrationConfig.sampleSize.driftMin &&
      pValue < calibrationConfig.drift.pValueThreshold &&
      absoluteShift >= calibrationConfig.drift.minAbsoluteFacilityShift;

    return {
      driftDetected,
      pValue,
      z,
      baselineFacility: baseline.facility,
      recentFacility: recentFacilityEst.facility,
      recentSampleSize: recentFacilityEst.sampleSize,
      absoluteShift,
    };
  }

  toAnomalyCandidate(result: DriftResult): AnomalyCandidate | null {
    if (!result.driftDetected) return null;
    return {
      type: 'DIFFICULTY_DRIFT',
      severity: result.absoluteShift >= 0.2 ? 'HIGH' : 'MEDIUM',
      details: {
        baselineFacility: result.baselineFacility,
        recentFacility: result.recentFacility,
        recentSampleSize: result.recentSampleSize,
        pValue: result.pValue,
        note: 'Statistically significant shift vs. baseline. Check validity, population stability, and exposure before recalibrating (§62).',
      },
    };
  }
}
