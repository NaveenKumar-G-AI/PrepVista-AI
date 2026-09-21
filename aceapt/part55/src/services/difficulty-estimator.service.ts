import { calibrationConfig, facilityToCategory, CONDITIONED_MODES } from '../config/calibration.config.js';
import {
  clamp01,
  median,
  percentile,
  trimOutliersIQR,
  wilsonScoreInterval,
} from '../lib/stats.js';
import type {
  CalibrationComputation,
  ConfidenceLevel,
  DifficultyCategory,
  DifficultyModeT,
  DiscriminationEstimate,
  EligibleObservation,
  FacilityEstimate,
  ModeSnapshotEstimate,
  TimeEstimate,
} from '../types/difficulty.types.js';

/**
 * P0 empirical difficulty model (§107): facility + Wilson uncertainty +
 * sample size + robust time statistics + context segmentation. No IRT, no
 * ability parameter — §109 is explicit that a psychometric model shouldn't
 * be forced into production ahead of the evidence and expertise it needs.
 * Everything here is deterministic and independent of the database, so it's
 * fully covered by tests/difficulty-estimator.test.ts without a live DB.
 */
export class DifficultyEstimator {
  computeFacility(observations: EligibleObservation[]): FacilityEstimate {
    const n = observations.length;
    const correct = observations.filter((o) => o.isCorrect).length;
    const { point, low, high } = wilsonScoreInterval(correct, n);
    return {
      facility: n === 0 ? 0.5 : point, // 0.5 = "no signal", never surfaced without status=PROVISIONAL
      ciLow: n === 0 ? 0 : low,
      ciHigh: n === 0 ? 1 : high,
      sampleSize: n,
      confidence: this.bucketConfidence(n, n === 0 ? 1 : high - low),
    };
  }

  private bucketConfidence(sampleSize: number, intervalWidth: number): ConfidenceLevel {
    const { high, medium } = calibrationConfig.confidence;
    if (sampleSize >= high.minSample && intervalWidth <= high.maxIntervalWidth) return 'HIGH';
    if (sampleSize >= medium.minSample && intervalWidth <= medium.maxIntervalWidth) return 'MEDIUM';
    return 'LOW';
  }

  computeTime(observations: EligibleObservation[]): TimeEstimate {
    const raw = observations
      .filter((o) => o.timeIsReliable && o.responseTimeMs !== null)
      .map((o) => o.responseTimeMs as number);

    if (raw.length < calibrationConfig.sampleSize.timeStatsMin) {
      return {
        medianMs: raw.length > 0 ? median(raw) : null,
        p25Ms: null,
        p75Ms: null,
        sampleSize: raw.length,
        reliable: false,
        outliersDropped: 0,
      };
    }

    const { kept, droppedCount } = trimOutliersIQR(raw);
    return {
      medianMs: median(kept),
      p25Ms: percentile(kept, 0.25),
      p75Ms: percentile(kept, 0.75),
      sampleSize: kept.length,
      reliable: true,
      outliersDropped: droppedCount,
    };
  }

  /**
   * P1-lite item discrimination (§67-68): splits observations that carry an
   * ability proxy into thirds and compares top-third vs bottom-third
   * facility. This is deliberately NOT a point-biserial correlation or any
   * IRT-adjacent statistic — just a transparent, explainable gap that's
   * enough to flag "strong students aren't doing better than weak students
   * on this item," which is the actual product need in §68.
   */
  computeDiscrimination(observations: EligibleObservation[]): DiscriminationEstimate {
    const withProxy = observations.filter((o) => o.abilityProxy !== null) as Array<
      EligibleObservation & { abilityProxy: number }
    >;
    if (withProxy.length < calibrationConfig.sampleSize.discriminationMin) {
      return { value: null, sampleSize: withProxy.length, reliable: false };
    }
    const sorted = [...withProxy].sort((a, b) => a.abilityProxy - b.abilityProxy);
    const third = Math.floor(sorted.length / 3);
    const bottom = sorted.slice(0, third);
    const top = sorted.slice(sorted.length - third);
    const facilityOf = (xs: typeof sorted) =>
      xs.length === 0 ? 0 : xs.filter((o) => o.isCorrect).length / xs.length;
    const value = clampNegOneToOne(facilityOf(top) - facilityOf(bottom));
    return { value, sampleSize: withProxy.length, reliable: true };
  }

  private modePredicate(mode: DifficultyModeT): (o: EligibleObservation) => boolean {
    switch (mode) {
      case 'UNTIMED':
        return (o) => o.mode === 'UNTIMED';
      case 'TIMED':
        return (o) => o.mode === 'TIMED';
      case 'FAMILIAR':
        return (o) => !o.isNovel;
      case 'NOVEL':
        return (o) => o.isNovel;
      case 'INDEPENDENT':
        return (o) => o.hintsUsed === 0;
      case 'GUIDED':
        return (o) => o.hintsUsed > 0;
      default:
        return () => true;
    }
  }

  computeConditioned(observations: EligibleObservation[]): ModeSnapshotEstimate[] {
    const results: ModeSnapshotEstimate[] = [];
    for (const mode of CONDITIONED_MODES) {
      const subset = observations.filter(this.modePredicate(mode));
      if (subset.length < calibrationConfig.sampleSize.conditionedModeMin) continue;
      results.push({
        mode,
        facility: this.computeFacility(subset),
        time: this.computeTime(subset),
      });
    }
    return results;
  }

  compute(input: {
    questionVersionId: string;
    populationId: string;
    observations: EligibleObservation[];
    initialCategory: DifficultyCategory | null;
    contentHash: string;
  }): CalibrationComputation {
    const { observations, initialCategory } = input;
    const facility = this.computeFacility(observations);
    const time = this.computeTime(observations);
    const discrimination = this.computeDiscrimination(observations);
    const conditioned = this.computeConditioned(observations);

    const n = observations.length;
    const status =
      n >= calibrationConfig.sampleSize.calibratedMin ? 'CALIBRATED' : 'PROVISIONAL';

    // §216: never let a handful of attempts flip the student-facing label —
    // below categoryEmpiricalMin, keep showing the initial estimate's
    // category even though the (low-confidence) empirical facility is
    // already stored for admins to see.
    const category: DifficultyCategory | null =
      n >= calibrationConfig.sampleSize.categoryEmpiricalMin
        ? facilityToCategory(facility.facility)
        : initialCategory;

    const empiricalCategory =
      n >= calibrationConfig.sampleSize.categoryEmpiricalMin ? facilityToCategory(facility.facility) : null;
    const labelMismatch =
      status === 'CALIBRATED' &&
      initialCategory !== null &&
      empiricalCategory !== null &&
      initialCategory !== empiricalCategory;

    return {
      questionVersionId: input.questionVersionId,
      populationId: input.populationId,
      overall: { mode: 'OVERALL', facility, time },
      conditioned,
      discrimination,
      status,
      category,
      initialCategory,
      labelMismatch,
      contentHash: input.contentHash,
    };
  }
}

// small helper kept local & obviously named to avoid a typo-prone inline clamp
function clampNegOneToOne(x: number): number {
  return Math.max(-1, Math.min(1, x));
}
