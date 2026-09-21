import {
  InterventionOutcome,
  InterventionProfile,
  InterventionProfileEntry,
  InterventionType,
  ResponseLabel
} from '../domain/types';
import { PROFILE_THRESHOLDS, NON_RESPONSE_WINDOW, SATURATION_WINDOW_DAYS, SATURATION_MAX_USES } from '../config';

const SUCCESS_LABELS = new Set(['SUCCESSFUL', 'PARTIALLY_EFFECTIVE']);
const INEFFECTIVE_LABELS = new Set(['NO_MEASURABLE_CHANGE', 'NEGATIVE_RESPONSE']);

function labelFromRate(attempts: number, successRate: number): ResponseLabel {
  if (attempts < PROFILE_THRESHOLDS.minAttemptsForLabel) return 'INSUFFICIENT_DATA';
  if (successRate >= PROFILE_THRESHOLDS.highResponseSuccessRate) return 'HIGH';
  if (successRate >= PROFILE_THRESHOLDS.mediumHighResponseSuccessRate) return 'MEDIUM_HIGH';
  if (successRate >= PROFILE_THRESHOLDS.mediumResponseSuccessRate) return 'MEDIUM';
  return 'LOW';
}

function runningAverage(priorAvg: number | null, newValue: number | null, count: number): number | null {
  if (newValue === null) return priorAvg;
  if (priorAvg === null || count <= 1) return newValue;
  return (priorAvg * (count - 1) + newValue) / count;
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

function blankEntry(type: InterventionType): InterventionProfileEntry {
  return {
    type,
    attempts: 0,
    successes: 0,
    avgImmediateDeltaPct: null,
    retentionChecks: 0,
    avgRetentionDeltaPct: null,
    responseLabel: 'INSUFFICIENT_DATA',
    nonResponseFlag: false,
    saturationFlag: false
  };
}

/**
 * Folds one completed intervention attempt into the student's per-type
 * response profile. Called once, when an execution is completed (Section
 * 14). `recentOutcomesForType` must be most-recent-first and include the
 * outcome just recorded — it's used to scan back for non-response /
 * saturation patterns (Sections 15-16), not to recompute the running average
 * (which uses `attempts`).
 */
export function recordAttempt(
  profile: InterventionProfile | null,
  studentId: string,
  type: InterventionType,
  outcome: InterventionOutcome,
  recentOutcomesForType: InterventionOutcome[]
): InterventionProfile {
  const existing = profile?.entries.find(e => e.type === type) ?? blankEntry(type);
  const attempts = existing.attempts + 1;
  const successes = existing.successes + (SUCCESS_LABELS.has(outcome.immediateEffectiveness) ? 1 : 0);

  const immediateDelta =
    outcome.beforeAccuracyPct !== undefined && outcome.immediateAccuracyPct !== undefined
      ? outcome.immediateAccuracyPct - outcome.beforeAccuracyPct
      : null;
  const avgImmediateDeltaPct = runningAverage(existing.avgImmediateDeltaPct, immediateDelta, attempts);

  const lastN = recentOutcomesForType.slice(0, NON_RESPONSE_WINDOW);
  const nonResponseFlag =
    lastN.length >= NON_RESPONSE_WINDOW && lastN.every(o => INEFFECTIVE_LABELS.has(o.immediateEffectiveness));

  const windowStart = Date.now() - SATURATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentUses = recentOutcomesForType.filter(o => new Date(o.evaluatedAt).getTime() >= windowStart);
  const saturationFlag = recentUses.length >= SATURATION_MAX_USES;

  const entry: InterventionProfileEntry = {
    ...existing,
    attempts,
    successes,
    avgImmediateDeltaPct: round1(avgImmediateDeltaPct),
    responseLabel: labelFromRate(attempts, attempts === 0 ? 0 : successes / attempts),
    lastUsedAt: outcome.evaluatedAt,
    nonResponseFlag,
    saturationFlag
  };

  const otherEntries = (profile?.entries ?? []).filter(e => e.type !== type);
  return { studentId, entries: [...otherEntries, entry], updatedAt: new Date().toISOString() };
}

/**
 * Folds a retention check into the profile WITHOUT touching attempts,
 * successes, or the immediate-delta average — a retention check enriches an
 * attempt that was already recorded, it is not a new attempt.
 */
export function recordRetentionCheck(
  profile: InterventionProfile | null,
  studentId: string,
  type: InterventionType,
  outcome: InterventionOutcome
): InterventionProfile {
  const existing = profile?.entries.find(e => e.type === type) ?? blankEntry(type);

  const retentionDelta =
    outcome.retentionAccuracyPct !== undefined && outcome.beforeAccuracyPct !== undefined
      ? outcome.retentionAccuracyPct - outcome.beforeAccuracyPct
      : null;
  const retentionChecks = existing.retentionChecks + (retentionDelta !== null ? 1 : 0);
  const avgRetentionDeltaPct = runningAverage(existing.avgRetentionDeltaPct, retentionDelta, retentionChecks);

  const entry: InterventionProfileEntry = {
    ...existing,
    retentionChecks,
    avgRetentionDeltaPct: round1(avgRetentionDeltaPct)
  };

  const otherEntries = (profile?.entries ?? []).filter(e => e.type !== type);
  return { studentId, entries: [...otherEntries, entry], updatedAt: new Date().toISOString() };
}
