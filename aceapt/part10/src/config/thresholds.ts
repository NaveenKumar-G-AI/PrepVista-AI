/**
 * Centralized, tunable thresholds for every Feature 10 engine.
 *
 * Spec: SS11 (Mastery Momentum - "Centralize configurable thresholds"),
 *       SS35 (Deterministic Core)
 *
 * Nothing in engines/ should hardcode a magic number that isn't defined
 * here. A product owner or learning scientist can retune behavior by
 * editing this file only - no engine logic changes required.
 */
export const THRESHOLDS = {
  trajectory: {
    minPointsForTrend: 3, // SS9 - need >=3 points to call any trend
    upwardSlopePerWeek: 2.0, // pct points/week to call "upward"
    slowingRatio: 0.5, // recent-half slope < 50% of earlier-half slope => slowing
    regressingSlopePerWeek: -2.0,
    stableBand: 1.5, // |slope| within this band (pts/wk) => stable
  },
  momentum: {
    accelerationDelta: 1.5, // avg increase in delta-of-deltas => accelerating
    stableDeltaStdev: 2.0, // stdev of raw deltas below this => steady pace (STABLE)
  },
  regression: {
    minDropPoints: 6, // SS12 - minimum cumulative drop to flag regression
    minConsecutiveDeclines: 2,
    lookbackPoints: 4,
  },
  volatility: {
    stableCV: 0.08, // coefficient-of-variation bands, SS22
    moderateCV: 0.18, // > moderateCV => HIGHLY_VARIABLE
  },
  falseMastery: {
    minGapPoints: 15, // SS13 - practice vs transfer/simulation gap
  },
  confidence: {
    minEvidenceForHigh: 6, // SS14, SS36
    minEvidenceForMedium: 3,
    minEvidenceForLow: 1,
    recencyHalfLifeDays: 14,
    volumeWeight: 0.3,
    recencyWeight: 0.25,
    consistencyWeight: 0.25,
    diversityWeight: 0.2,
  },
  bottleneck: {
    impactWeights: {
      // SS18 - weighting for the impact score, must sum to 1.0
      weaknessSeverity: 0.35,
      simulationTimeCost: 0.35,
      downstreamAccuracyEffect: 0.3,
    },
    chainTimeCostRatioThreshold: 1.15, // SS19
    chainAccuracyEffectThreshold: 0.3,
  },
  risk: {
    timeManagementRatioHigh: 1.25, // observed/allocated simulation time
    timeManagementRatioMedium: 1.1,
    lateSessionDeclineHigh: 0.15, // SS23 endurance
    lateSessionDeclineMedium: 0.08,
    retentionGapDaysHigh: 21, // SS24
    retentionGapDaysMedium: 10,
    earlyWarningMildSignalCount: 3, // SS21
  },
  target: {
    onTrackBufferPoints: 2, // SS16 - gap <= buffer => ON_TRACK
    atRiskWindowDays: 10, // inside this many days with a gap => BEHIND not AT_RISK
  },
  intervention: {
    highResponseDelta: 8, // SS25 - points gained to call HIGH_RESPONSE
    moderateResponseDelta: 3,
  },
} as const;
