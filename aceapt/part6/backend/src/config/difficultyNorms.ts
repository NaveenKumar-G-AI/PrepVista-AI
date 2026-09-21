import { Difficulty } from '../domain/types';

/**
 * Baseline expected-time norms (seconds) and scoring weights per difficulty.
 * Individual questions may override expectedTimeSeconds; these are the
 * fallback/defaults used when generating the seed question bank and for any
 * question that doesn't carry its own calibrated value yet.
 *
 * These are prototype defaults, not empirically calibrated against real
 * student data - see README "Readiness model" section. They are intentionally
 * centralized here (not hardcoded inline) so they can be tuned or replaced
 * with calibrated values later without touching business logic.
 */
export const EXPECTED_TIME_SECONDS: Record<Difficulty, number> = {
  EASY: 45,
  MEDIUM: 75,
  MEDIUM_PLUS: 110,
  HARD: 150,
};

/** Relative scoring weight per difficulty, used when scoringRule === 'DIFFICULTY_WEIGHTED'. */
export const DIFFICULTY_SCORE_WEIGHT: Record<Difficulty, number> = {
  EASY: 1,
  MEDIUM: 1.5,
  MEDIUM_PLUS: 2,
  HARD: 2.5,
};

export const DIFFICULTY_ORDER: Difficulty[] = ['EASY', 'MEDIUM', 'MEDIUM_PLUS', 'HARD'];

/** A question is flagged as OVER_INVESTMENT if actual time exceeds expected time by this multiple. */
export const OVER_INVESTMENT_MULTIPLIER = 2.0;

/** A question is flagged as UNDER_INVESTMENT (rushed) if actual time is below this fraction of expected time. */
export const UNDER_INVESTMENT_FRACTION = 0.35;
