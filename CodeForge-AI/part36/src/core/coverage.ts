import { EvidenceCoverageState } from '../domain/enums';

export interface CoverageThresholds {
  low: number;
  medium: number;
  high: number;
}

export const DEFAULT_COVERAGE_THRESHOLDS: CoverageThresholds = {
  low: 0.3,
  medium: 0.5,
  high: 0.75,
};

export interface CoverageResult {
  eligibleStudents: number;
  studentsWithEvidence: number;
  studentsWithoutEvidence: number;
  coveragePct: number;
  coverageState: EvidenceCoverageState;
}

/**
 * Section 10/11 — every cohort view must know eligible vs. with/without
 * evidence, and the coverage state gates whether a strength/weakness
 * claim is legitimate at all. Never divides by zero, never returns a
 * fabricated ratio.
 */
export function computeCoverage(
  eligibleStudents: number,
  studentsWithEvidence: number,
  thresholds: CoverageThresholds = DEFAULT_COVERAGE_THRESHOLDS
): CoverageResult {
  if (eligibleStudents < 0 || studentsWithEvidence < 0) {
    throw new Error('eligibleStudents and studentsWithEvidence must be >= 0');
  }
  if (studentsWithEvidence > eligibleStudents) {
    throw new Error('studentsWithEvidence cannot exceed eligibleStudents');
  }

  const coveragePct = eligibleStudents === 0 ? 0 : studentsWithEvidence / eligibleStudents;

  let coverageState: EvidenceCoverageState;
  if (eligibleStudents === 0 || coveragePct < thresholds.low) {
    coverageState = EvidenceCoverageState.INSUFFICIENT;
  } else if (coveragePct < thresholds.medium) {
    coverageState = EvidenceCoverageState.LOW;
  } else if (coveragePct < thresholds.high) {
    coverageState = EvidenceCoverageState.MEDIUM;
  } else {
    coverageState = EvidenceCoverageState.HIGH;
  }

  return {
    eligibleStudents,
    studentsWithEvidence,
    studentsWithoutEvidence: eligibleStudents - studentsWithEvidence,
    coveragePct,
    coverageState,
  };
}

/** Golden rule (section 10): below INSUFFICIENT coverage we must not
 * claim a skill/role is "weak" or "strong" — only that evidence is
 * insufficient. Every caller that wants to report a strength, gap, or
 * trend must check this first. */
export function canMakeStrengthClaim(coverage: CoverageResult): boolean {
  return coverage.coverageState !== EvidenceCoverageState.INSUFFICIENT;
}

// ── Privacy threshold (sections 31, 62, 71) ─────────────────────────

export interface PrivacyPolicy {
  minCohortSize: number;
}

export const DEFAULT_PRIVACY_POLICY: PrivacyPolicy = { minCohortSize: 10 };

export type PrivacyGuardResult =
  | { restricted: false }
  | { restricted: true; reason: 'COHORT_TOO_SMALL'; minCohortSize: number; actualSize: number };

/**
 * Never show cohort statistics when the group is too small — this
 * protects any individual student from being de-anonymized by a
 * skewed small-sample aggregate.
 */
export function applyPrivacyThreshold(
  cohortSize: number,
  policy: PrivacyPolicy = DEFAULT_PRIVACY_POLICY
): PrivacyGuardResult {
  if (cohortSize < policy.minCohortSize) {
    return {
      restricted: true,
      reason: 'COHORT_TOO_SMALL',
      minCohortSize: policy.minCohortSize,
      actualSize: cohortSize,
    };
  }
  return { restricted: false };
}
