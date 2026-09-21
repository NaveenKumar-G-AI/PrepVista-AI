import type {
  ConfidenceBucket,
  DefiniteMasteryLevel,
  Difficulty,
  EvidenceStrengthTier,
  MasteryLevel,
  SkillImportance,
} from './types';

/**
 * Versioned algorithm configuration (Phase 25).
 *
 * No existing CodeForge AI role model or weighting scheme was available to
 * inspect in this environment (see repository root README, "Integration
 * status"). Every number below is therefore a documented, defensible
 * starting default — NOT a value pulled from real product calibration.
 * This file is the ONLY place these numbers should live; nothing in
 * evidenceAggregation/confidence/classification hardcodes a number that
 * isn't imported from here. When you have real data, tune here and bump
 * ALGORITHM_VERSION — old snapshots keep their own stamped version and stay
 * interpretable (Phase 25/26).
 */
export const ALGORITHM_VERSION = 'readiness-algorithm-v1.0.0';

export const MASTERY_ORDER: MasteryLevel[] = [
  'unassessed',
  'emerging',
  'developing',
  'competent',
  'strong',
  'advanced',
];

export const MASTERY_ANCHOR_SCORE: Record<DefiniteMasteryLevel, number> = {
  emerging: 20,
  developing: 40,
  competent: 60,
  strong: 80,
  advanced: 95,
};

export const MASTERY_CUTPOINTS: Array<{ min: number; level: DefiniteMasteryLevel }> = [
  { min: 85, level: 'advanced' },
  { min: 70, level: 'strong' },
  { min: 55, level: 'competent' },
  { min: 35, level: 'developing' },
  { min: 0, level: 'emerging' },
];

export const IMPORTANCE_WEIGHT: Record<SkillImportance, number> = {
  core: 4,
  important: 2,
  supporting: 1,
  optional: 0.5,
};

export const EVIDENCE_TIER_WEIGHT: Record<EvidenceStrengthTier, number> = {
  verified_direct_performance: 1.0,
  repeated_verified_performance: 1.0,
  verified_understanding: 0.75,
  reasoning_consistency: 0.6,
  historical_performance: 0.45,
  weak_indirect: 0.25,
};

/** Low to high — used for "does this evidence meet the minimum tier" comparisons. */
export const EVIDENCE_TIER_RANK: EvidenceStrengthTier[] = [
  'weak_indirect',
  'historical_performance',
  'reasoning_consistency',
  'verified_understanding',
  'repeated_verified_performance',
  'verified_direct_performance',
];

export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  easy: 0.6,
  medium: 0.85,
  hard: 1.0,
  expert: 1.15,
};

export const DIFFICULTY_RANK: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

/** Score, at or above, counted as "passed" a piece of evidence at its difficulty (Phase 11). */
export const DIFFICULTY_PASS_BAR = 70;

/** Recency decay (Phase 9) — configurable, explainable, versioned, tested. */
export const RECENCY_HALF_LIFE_DAYS = 120;
export const RECENCY_MIN_WEIGHT = 0.15;

/** Consistency detection (Phase 10) — never flagged from a tiny sample. */
export const CONSISTENCY_MIN_SAMPLE = 4;
export const CONSISTENCY_WINDOW = 6;
export const CONSISTENCY_STDDEV_THRESHOLD = 14;

/** Trend detection window — compares last N qualifying scores vs the N before that. */
export const TREND_WINDOW = 3;
export const TREND_DELTA_THRESHOLD = 6;

export const CONFIDENCE_WEIGHTS = {
  quantity: 0.30,
  quality: 0.20,
  diversity: 0.15,
  recency: 0.15,
  consistency: 0.20,
};

export const CONFIDENCE_BUCKET_THRESHOLDS: { low: number; medium: number } = { low: 0.40, medium: 0.72 };

export const OVERALL_CONFIDENCE_SPLIT = { coverage: 0.5, skillAverage: 0.5 };

export const CONFIDENCE_RANK: Record<ConfidenceBucket, number> = { low: 0, medium: 1, high: 2 };

/** Classification thresholds (Phase 15) — deliberately named by what they gate, not by number. */
export const CLASSIFICATION_THRESHOLDS = {
  notAssessedCoverageBelow: 0.15,
  developingScoreAtLeast: 35,
  approachingReadyScoreAtLeast: 55,
  readyScoreAtLeast: 75,
  stronglyReadyScoreAtLeast: 90,
  readyMinConfidence: 'medium' as ConfidenceBucket,
  stronglyReadyMinConfidence: 'high' as ConfidenceBucket,
};

/** A skill scoring above its required threshold gets a little credit, capped — not unlimited overachievement. */
export const RATIO_CAP_PER_SKILL = 1.15;

export const STRENGTH_MAX_COUNT = 5;

/** Coverage/quantity confidence factors treat this as "full credit" evidence count. */
export const CONFIDENCE_QUANTITY_MULTIPLIER = 1.5;
