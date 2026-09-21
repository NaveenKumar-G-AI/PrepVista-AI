import * as stateRepo from '../repositories/studentStateRepository';
import * as usageRepo from '../repositories/usageRepository';
import * as analytics from '../repositories/analyticsRepository';
import { computeTrustState, TRUST_THRESHOLDS } from './trust';
import { logger } from '../utils/logger';

export interface RegressionScanResult {
  scanned: number;
  downgraded: Array<{ studentId: string; shortcutId: string; from: string; to: string }>;
}

/**
 * Batch re-check for regression (sec. 56, 226). PerformanceService already
 * checks for regression inline on every new usage, which catches it in
 * real time; this scan exists for the case data changed *without* a new
 * usage - e.g. an admin excluded some usages after a question was
 * invalidated upstream (sec. 136, 259) - and needs everyone's state
 * recomputed from what's left.
 */
export function scanForRegressions(tenantId: string): RegressionScanResult {
  const candidates = stateRepo.listStatesByTrust(tenantId, ['TRUSTED', 'RELIABLE']);
  const downgraded: RegressionScanResult['downgraded'] = [];

  for (const state of candidates) {
    const usages = usageRepo.listUsages(state.student_id, state.shortcut_id);
    const usageCount = usages.length;
    const successCount = usages.filter((u) => u.correct === 1).length;
    const accuracy = usageCount > 0 ? successCount / usageCount : 0;
    const timeSavedRatios = usages
      .filter((u) => u.baseline_time_ms != null && u.response_time_ms != null && u.baseline_time_ms > 0)
      .map((u) => (u.baseline_time_ms! - u.response_time_ms!) / u.baseline_time_ms!);
    const avgTimeSavedRatio = timeSavedRatios.length > 0 ? timeSavedRatios.reduce((a, b) => a + b, 0) / timeSavedRatios.length : null;
    const recentWindow = usages.slice(0, TRUST_THRESHOLDS.REGRESSION_WINDOW);
    const recentWindowAccuracy = recentWindow.length >= TRUST_THRESHOLDS.MIN_USES_FOR_RELIABLE ? recentWindow.filter((u) => u.correct === 1).length / recentWindow.length : null;

    const { state: newState, regressed } = computeTrustState({
      usageCount,
      successCount,
      accuracy,
      avgTimeSavedRatio,
      recentWindowAccuracy,
      previousState: state.state,
    });

    if (newState !== state.state) {
      stateRepo.updateStateAfterUsage(state.id, {
        state: newState,
        reliability: accuracy,
        usageCount,
        successCount,
        avgTimeSavedRatio,
        lastUsedAt: state.last_used_at ?? new Date().toISOString(),
      });
      downgraded.push({ studentId: state.student_id, shortcutId: state.shortcut_id, from: state.state, to: newState });
      if (regressed) {
        analytics.logEvent({ tenantId, studentId: state.student_id, eventType: 'shortcut_regressed', payload: { shortcutId: state.shortcut_id } });
      }
    }
  }

  logger.info('regression_scan_complete', { tenantId, scanned: candidates.length, downgraded: downgraded.length });
  return { scanned: candidates.length, downgraded };
}
