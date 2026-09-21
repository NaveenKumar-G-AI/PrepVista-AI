export type DifficultyStatus = 'PROVISIONAL' | 'CALIBRATED' | 'STALE' | 'NEEDS_REVIEW';
export type DifficultySource = 'AUTHOR' | 'AI' | 'STRUCTURAL' | 'EMPIRICAL' | 'CALIBRATED';
export type DifficultyCategory = 'EASY' | 'MEDIUM' | 'HARD';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type DifficultyModeT =
  | 'OVERALL'
  | 'UNTIMED'
  | 'TIMED'
  | 'FAMILIAR'
  | 'NOVEL'
  | 'INDEPENDENT'
  | 'GUIDED';

export type AnomalyType =
  | 'TOO_EASY'
  | 'TOO_HARD'
  | 'UNEXPECTEDLY_SLOW'
  | 'UNEXPECTEDLY_FAST'
  | 'HIGH_VARIANCE'
  | 'LABEL_MISMATCH'
  | 'DIFFICULTY_DRIFT'
  | 'INSUFFICIENT_DATA'
  | 'WEAK_DISCRIMINATION';

export type AnomalyStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

/**
 * One eligible attempt, already filtered and shaped by
 * CalibrationEligibilityService. Nothing downstream re-derives eligibility —
 * an observation reaching the estimator is, by construction, allowed to
 * influence calibration (§103).
 */
export interface EligibleObservation {
  attemptId: string;
  isCorrect: boolean;
  responseTimeMs: number | null;
  timeIsReliable: boolean;
  mode: 'UNTIMED' | 'TIMED';
  hintsUsed: number;
  isNovel: boolean;
  exposureNumber: number;
  sessionPositionPct: number | null;
  abilityProxy: number | null; // 0..1, for discrimination-lite only
  createdAt: Date;
}

export interface EligibilityExclusion {
  attemptId: string;
  reason:
    | 'TEST_ACCOUNT'
    | 'INCOMPLETE'
    | 'INVALID_QUESTION_VERSION'
    | 'IMPOSSIBLE_TIMING'
    | 'DUPLICATE';
}

export interface EligibilityResult {
  eligible: EligibleObservation[];
  excluded: EligibilityExclusion[];
  questionVersionValid: boolean;
  qualityBlocksCalibration: boolean;
}

export interface FacilityEstimate {
  facility: number;
  ciLow: number;
  ciHigh: number;
  sampleSize: number;
  confidence: ConfidenceLevel;
}

export interface TimeEstimate {
  medianMs: number | null;
  p25Ms: number | null;
  p75Ms: number | null;
  sampleSize: number;
  reliable: boolean;
  outliersDropped: number;
}

export interface DiscriminationEstimate {
  value: number | null; // topThird facility - bottomThird facility, -1..1
  sampleSize: number;
  reliable: boolean;
}

export interface ModeSnapshotEstimate {
  mode: DifficultyModeT;
  facility: FacilityEstimate;
  time: TimeEstimate;
}

/** The full computed result for one question version + population, before
 * it becomes rows in difficulty_snapshots. Kept as a plain object so the
 * estimator is unit-testable with zero database involved. */
export interface CalibrationComputation {
  questionVersionId: string;
  populationId: string;
  overall: ModeSnapshotEstimate;
  conditioned: ModeSnapshotEstimate[]; // only modes that cleared conditionedModeMin
  discrimination: DiscriminationEstimate;
  status: DifficultyStatus;
  category: DifficultyCategory | null;
  initialCategory: DifficultyCategory | null;
  labelMismatch: boolean;
  contentHash: string;
}
