import { ProblemCategory, InterventionType } from './domain/types';

// ============================================================================
// Centralized, tunable configuration.
// These are reasonable prototype defaults, NOT empirically validated
// thresholds — see README "Tuning the engine" before relying on them with
// real student data. Nothing in engine/*.ts hard-codes a number outside
// this file.
// ============================================================================

export const ENGINE_CONFIG = {
  speedGap: { minSamplesPerGroup: 2, minGapPct: 15 },
  conceptGap: { minSamples: 3, maxAccuracyPct: 65 },
  calculationGap: { minSamples: 3, maxAccuracyPct: 75, minGapPct: 15 },
  retentionGap: { minSamples: 1, minCurrentAccuracyPct: 70, minDropPct: 10 },
  transferGap: { minSamples: 1, minGapPct: 15 }
};

export const RANKING_WEIGHTS = {
  problemFit: 1.0,
  studentFit: 0.6,
  contextFit: 0.5,
  historicalResponse: 0.8,
  expectedBenefit: 0.7,
  timeCost: 0.4,
  loadRisk: 0.3,
  nonResponsePenalty: 0.5,
  saturationPenalty: 0.3
};

// How directly a given intervention type addresses a given problem category.
// This is what stops the ranking engine from treating every candidate as
// interchangeable just because they came from the same problem.
export const PROBLEM_INTERVENTION_FIT: Partial<Record<ProblemCategory, Partial<Record<InterventionType, number>>>> = {
  SPEED_GAP: { TIMED_DRILL: 0.95, MICRO_ASSESSMENT: 0.55 },
  CONCEPT_GAP: { CONCEPT_RETEACH: 0.95, WORKED_EXAMPLE: 0.55, GUIDED_PRACTICE: 0.5 },
  CALCULATION_GAP: { TARGETED_PRACTICE: 0.9, GUIDED_PRACTICE: 0.6, MICRO_ASSESSMENT: 0.5 },
  RETENTION_GAP: { SPACED_REVIEW: 0.9, MICRO_ASSESSMENT: 0.5 },
  TRANSFER_GAP: { TRANSFER_PRACTICE: 0.95 }
};

export const OUTCOME_THRESHOLDS = {
  successfulDeltaPct: 10,
  partiallyEffectiveDeltaPct: 4,
  negativeDeltaPct: -4
};

export const PROFILE_THRESHOLDS = {
  minAttemptsForLabel: 2,
  highResponseSuccessRate: 0.7,
  mediumHighResponseSuccessRate: 0.5,
  mediumResponseSuccessRate: 0.3
};

export const NON_RESPONSE_WINDOW = 2; // consecutive ineffective attempts -> flag non-response
export const SATURATION_WINDOW_DAYS = 10;
export const SATURATION_MAX_USES = 3; // same type used this many times in the window -> flag saturation

export const COLD_START_MIN_HISTORY = 2;
