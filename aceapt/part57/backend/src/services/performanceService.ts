import * as usageRepo from '../repositories/usageRepository';
import * as stateRepo from '../repositories/studentStateRepository';
import * as shortcutRepo from '../repositories/shortcutRepository';
import * as analytics from '../repositories/analyticsRepository';
import { computeTrustState, TRUST_THRESHOLDS } from './trust';
import type { NewUsageInput } from '../repositories/usageRepository';
import { logger } from '../utils/logger';

export interface RecordUsageInput extends NewUsageInput {}

export interface RecordUsageResult {
  usageId: string;
  previousState: string;
  newState: string;
  regressed: boolean;
  reliability: number;
  usageCount: number;
  avgTimeSavedRatio: number | null;
}

/**
 * The one place shortcut evidence gets written (secs. 41, 212, 217). Every
 * usage recomputes the student's trust state from their *entire* history
 * (sec. 55, "reliability... repeated successes... varied valid questions"),
 * not just the new event, so state is always a function of the full record
 * rather than something that can be nudged by a single lucky attempt
 * (sec. 21, "Save != Trust"; sec. 290, "trust... through repeated,
 * validated, appropriate performance").
 */
export function recordUsage(input: RecordUsageInput): RecordUsageResult {
  const shortcut = shortcutRepo.getShortcutById(input.shortcutId);
  if (!shortcut) throw new Error(`Unknown shortcut ${input.shortcutId}`);

  const usage = usageRepo.insertUsage(input);
  const state = stateRepo.getOrCreateState(input.tenantId, input.studentId, input.shortcutId);
  const previousState = state.state;

  const allUsages = usageRepo.listUsages(input.studentId, input.shortcutId);
  const usageCount = allUsages.length;
  const successCount = allUsages.filter((u) => u.correct === 1).length;
  const accuracy = usageCount > 0 ? successCount / usageCount : 0;

  const timeSavedRatios = allUsages
    .filter((u) => u.baseline_time_ms != null && u.response_time_ms != null && u.baseline_time_ms > 0)
    .map((u) => (u.baseline_time_ms! - u.response_time_ms!) / u.baseline_time_ms!);
  const avgTimeSavedRatio = timeSavedRatios.length > 0 ? timeSavedRatios.reduce((a, b) => a + b, 0) / timeSavedRatios.length : null;

  const recentWindow = allUsages.slice(0, TRUST_THRESHOLDS.REGRESSION_WINDOW);
  const recentWindowAccuracy =
    recentWindow.length >= Math.min(TRUST_THRESHOLDS.REGRESSION_WINDOW, TRUST_THRESHOLDS.MIN_USES_FOR_RELIABLE)
      ? recentWindow.filter((u) => u.correct === 1).length / recentWindow.length
      : null;

  const { state: newState, regressed } = computeTrustState({
    usageCount,
    successCount,
    accuracy,
    avgTimeSavedRatio,
    recentWindowAccuracy,
    previousState,
  });

  stateRepo.updateStateAfterUsage(state.id, {
    state: newState,
    reliability: accuracy,
    usageCount,
    successCount,
    avgTimeSavedRatio,
    lastUsedAt: usage.created_at,
  });

  analytics.logEvent({
    tenantId: input.tenantId,
    studentId: input.studentId,
    eventType: 'shortcut_used',
    payload: { shortcutId: input.shortcutId, usageId: usage.id, correct: input.correct },
  });
  analytics.logEvent({
    tenantId: input.tenantId,
    studentId: input.studentId,
    eventType: input.correct ? 'shortcut_success' : 'shortcut_failure',
    payload: { shortcutId: input.shortcutId, usageId: usage.id },
  });
  if (regressed) {
    analytics.logEvent({
      tenantId: input.tenantId,
      studentId: input.studentId,
      eventType: 'shortcut_regressed',
      payload: { shortcutId: input.shortcutId, recentWindowAccuracy },
    });
    logger.warn('shortcut_regressed', { studentId: input.studentId, shortcutId: input.shortcutId, recentWindowAccuracy });
  } else if (newState === 'TRUSTED' && previousState !== 'TRUSTED') {
    analytics.logEvent({
      tenantId: input.tenantId,
      studentId: input.studentId,
      eventType: 'shortcut_trusted',
      payload: { shortcutId: input.shortcutId, usageCount, accuracy, avgTimeSavedRatio },
    });
  }

  return {
    usageId: usage.id,
    previousState,
    newState,
    regressed,
    reliability: accuracy,
    usageCount,
    avgTimeSavedRatio,
  };
}

export interface ShortcutPerformanceSummary {
  usageCount: number;
  successCount: number;
  reliability: number;
  avgTimeSavedRatio: number | null;
  medianResponseTimeMs: number | null;
  medianBaselineTimeMs: number | null;
  state: string;
  byDifficulty: Record<string, { count: number; accuracy: number }>;
  byNovelty: Record<string, { count: number; accuracy: number }>;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

/** Backs the "Your performance" panel (sec. 88, 176) and the compare screen (sec. 177). */
export function getPerformanceSummary(studentId: string, shortcutId: string): ShortcutPerformanceSummary | null {
  const state = stateRepo.getState(studentId, shortcutId);
  if (!state) return null;
  const usages = usageRepo.listUsages(studentId, shortcutId);

  const byDifficulty: ShortcutPerformanceSummary['byDifficulty'] = {};
  const byNovelty: ShortcutPerformanceSummary['byNovelty'] = {};
  for (const u of usages) {
    if (u.difficulty) {
      byDifficulty[u.difficulty] ??= { count: 0, accuracy: 0 };
      byDifficulty[u.difficulty]!.count += 1;
    }
    if (u.novelty) {
      byNovelty[u.novelty] ??= { count: 0, accuracy: 0 };
      byNovelty[u.novelty]!.count += 1;
    }
  }
  for (const key of Object.keys(byDifficulty)) {
    const relevant = usages.filter((u) => u.difficulty === key);
    byDifficulty[key]!.accuracy = relevant.filter((u) => u.correct === 1).length / relevant.length;
  }
  for (const key of Object.keys(byNovelty)) {
    const relevant = usages.filter((u) => u.novelty === key);
    byNovelty[key]!.accuracy = relevant.filter((u) => u.correct === 1).length / relevant.length;
  }

  return {
    usageCount: state.usage_count,
    successCount: state.success_count,
    reliability: state.reliability,
    avgTimeSavedRatio: state.avg_time_saved_ratio,
    medianResponseTimeMs: median(usages.map((u) => u.response_time_ms).filter((v): v is number => v != null)),
    medianBaselineTimeMs: median(usages.map((u) => u.baseline_time_ms).filter((v): v is number => v != null)),
    state: state.state,
    byDifficulty,
    byNovelty,
  };
}
