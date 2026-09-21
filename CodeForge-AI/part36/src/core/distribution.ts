import { MasteryLevel, ReadinessState, TrendDirection, GapPriority } from '../domain/enums';
import { canMakeStrengthClaim, type CoverageResult } from './coverage';

// ── Mastery distribution (sections 12-13) ────────────────────────────

export type MasteryDistribution = Record<MasteryLevel, number>;

export function emptyMasteryDistribution(): MasteryDistribution {
  return {
    [MasteryLevel.NOT_ASSESSED]: 0,
    [MasteryLevel.EMERGING]: 0,
    [MasteryLevel.DEVELOPING]: 0,
    [MasteryLevel.PROFICIENT]: 0,
    [MasteryLevel.STRONG]: 0,
  };
}

/** Buckets individual validated skill-signal levels — already computed
 * by the existing Skill Signal Engine, never recomputed here — into a
 * cohort distribution. */
export function buildMasteryDistribution(individualLevels: MasteryLevel[]): MasteryDistribution {
  const dist = emptyMasteryDistribution();
  for (const level of individualLevels) {
    dist[level] += 1;
  }
  return dist;
}

const ASSESSED_LEVELS: MasteryLevel[] = [
  MasteryLevel.EMERGING,
  MasteryLevel.DEVELOPING,
  MasteryLevel.PROFICIENT,
  MasteryLevel.STRONG,
];

/** The "headline" level for a skill is the mode among *assessed*
 * students only (NOT_ASSESSED is coverage, not signal) — and it's only
 * meaningful to report at all once coverage clears the bar. */
export function dominantLevel(distribution: MasteryDistribution, coverage: CoverageResult): MasteryLevel | null {
  if (!canMakeStrengthClaim(coverage)) return null;

  let best: MasteryLevel | null = null;
  let bestCount = 0;
  for (const level of ASSESSED_LEVELS) {
    const count = distribution[level];
    if (count > bestCount) {
      bestCount = count;
      best = level;
    }
  }
  return best;
}

// ── Readiness distribution (section 25) ──────────────────────────────

export type ReadinessDistribution = Record<ReadinessState, number>;

export function emptyReadinessDistribution(): ReadinessDistribution {
  return {
    [ReadinessState.READY]: 0,
    [ReadinessState.NEAR_READY]: 0,
    [ReadinessState.DEVELOPING]: 0,
    [ReadinessState.NEEDS_SIGNIFICANT_PREPARATION]: 0,
    [ReadinessState.INSUFFICIENT_EVIDENCE]: 0,
  };
}

export function buildReadinessDistribution(individualStates: ReadinessState[]): ReadinessDistribution {
  const dist = emptyReadinessDistribution();
  for (const state of individualStates) {
    dist[state] += 1;
  }
  return dist;
}

// ── Trend (sections 40, 70, 78) ──────────────────────────────────────

export interface TrendInput {
  previousProficientShare: number | null;
  currentProficientShare: number | null;
  previousCoverage: CoverageResult | null;
  currentCoverage: CoverageResult;
}

export interface TrendResult {
  direction: TrendDirection;
  deltaPct: number | null;
}

/** +/-5 percentage points counts as "stable" rather than claiming a
 * misleadingly precise improving/declining label off noise. */
const STABLE_BAND_PCT = 0.05;

/** We only ever claim a trend when BOTH periods clear the coverage
 * bar. Otherwise: INSUFFICIENT_EVIDENCE, never a guess dressed up as a
 * number (section 40's "avoid exaggerated precision"). */
export function computeTrend(input: TrendInput): TrendResult {
  const { previousProficientShare, currentProficientShare, previousCoverage, currentCoverage } = input;

  const currentOk = canMakeStrengthClaim(currentCoverage);
  const previousOk = previousCoverage ? canMakeStrengthClaim(previousCoverage) : false;

  if (!currentOk || !previousOk || previousProficientShare === null || currentProficientShare === null) {
    return { direction: TrendDirection.INSUFFICIENT_EVIDENCE, deltaPct: null };
  }

  const delta = currentProficientShare - previousProficientShare;

  if (Math.abs(delta) < STABLE_BAND_PCT) {
    return { direction: TrendDirection.STABLE, deltaPct: delta };
  }
  return { direction: delta > 0 ? TrendDirection.IMPROVING : TrendDirection.DECLINING, deltaPct: delta };
}

// ── Gap priority (section 14) ────────────────────────────────────────

export interface GapInput {
  roleImportance: number; // 0-1
  observedProficiencyShare: number; // 0-1, share at Proficient+Strong among assessed
  placementRelevance: number; // 0-1
  affectedStudents: number;
  coverage: CoverageResult;
}

/** Weighted composite, intentionally simple and explainable — the
 * "Why?" panel (section 59) needs to be able to point at these exact
 * factors, not a black box. */
export function classifyGapPriority(input: GapInput): GapPriority {
  if (!canMakeStrengthClaim(input.coverage)) {
    return GapPriority.INSUFFICIENT_EVIDENCE;
  }

  const gapSeverity = 1 - input.observedProficiencyShare;
  const score =
    gapSeverity * 0.45 +
    input.roleImportance * 0.3 +
    input.placementRelevance * 0.15 +
    Math.min(input.affectedStudents / 50, 1) * 0.1;

  if (score >= 0.6) return GapPriority.HIGH;
  if (score >= 0.35) return GapPriority.MODERATE;
  return GapPriority.EMERGING;
}
