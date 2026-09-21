import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { migrate, resetDb } from './helpers/db';
import * as shortcutRepo from '../src/repositories/shortcutRepository';
import * as stateRepo from '../src/repositories/studentStateRepository';
import { recordUsage, getPerformanceSummary } from '../src/services/performanceService';
import { TRUST_THRESHOLDS } from '../src/services/trust';

describe('performanceService.recordUsage (integration)', () => {
  beforeAll(migrate);
  beforeEach(resetDb);

  function seedShortcut() {
    const shortcut = shortcutRepo.insertShortcut({
      tenantId: 'test-tenant',
      ownerStudentId: null,
      canonicalName: 'Quarter Method',
      description: '25% shortcut',
      category: 'Quantitative',
      domain: 'Percentages',
      strategyType: 'PERCENTAGE_TRICK',
      classification: 'CONDITIONAL',
      source: 'CONTENT_TEAM',
      status: 'VERIFIED',
    });
    shortcutRepo.insertVersion({
      shortcutId: shortcut.shortcut_id,
      version: 1,
      description: '',
      steps: [],
      conditions: [],
      nonApplicability: [],
      underlyingReason: '',
    });
    return shortcut;
  }

  it('does not grant TRUSTED after a single correct, fast use (sec. 21, 248)', () => {
    const shortcut = seedShortcut();
    const result = recordUsage({
      tenantId: 'test-tenant',
      studentId: 'stu-1',
      shortcutId: shortcut.shortcut_id,
      applied: true,
      correct: true,
      responseTimeMs: 5000,
      baselineTimeMs: 18000,
      mode: 'PRACTICE',
    });
    expect(result.newState).not.toBe('TRUSTED');
  });

  it('climbs to TRUSTED only after enough accurate, time-saving repeats (secs. 54-55, 248-249)', () => {
    const shortcut = seedShortcut();
    let last;
    for (let i = 0; i < TRUST_THRESHOLDS.MIN_USES_FOR_TRUSTED; i += 1) {
      last = recordUsage({
        tenantId: 'test-tenant',
        studentId: 'stu-2',
        shortcutId: shortcut.shortcut_id,
        applied: true,
        correct: true,
        responseTimeMs: 6000,
        baselineTimeMs: 18000,
        mode: 'PRACTICE',
      });
    }
    expect(last!.newState).toBe('TRUSTED');

    const summary = getPerformanceSummary('stu-2', shortcut.shortcut_id)!;
    expect(summary.usageCount).toBe(TRUST_THRESHOLDS.MIN_USES_FOR_TRUSTED);
    expect(summary.avgTimeSavedRatio).toBeGreaterThan(0.5);
  });

  it('detects regression after a previously trusted shortcut starts failing (secs. 56, 251)', () => {
    const shortcut = seedShortcut();
    for (let i = 0; i < TRUST_THRESHOLDS.MIN_USES_FOR_TRUSTED; i += 1) {
      recordUsage({
        tenantId: 'test-tenant',
        studentId: 'stu-3',
        shortcutId: shortcut.shortcut_id,
        applied: true,
        correct: true,
        responseTimeMs: 6000,
        baselineTimeMs: 18000,
        mode: 'PRACTICE',
      });
    }
    const trusted = stateRepo.getState('stu-3', shortcut.shortcut_id)!;
    expect(trusted.state).toBe('TRUSTED');

    const results = [];
    for (let i = 0; i < TRUST_THRESHOLDS.REGRESSION_WINDOW; i += 1) {
      results.push(
        recordUsage({
          tenantId: 'test-tenant',
          studentId: 'stu-3',
          shortcutId: shortcut.shortcut_id,
          applied: true,
          correct: false,
          responseTimeMs: 9000,
          baselineTimeMs: 18000,
          mode: 'PRACTICE',
        })
      );
    }
    // The regression flag fires exactly once, at the moment of detection -
    // not on every subsequent call while already under review - so check
    // that it fired at some point during the bad run, and that the student
    // ends up NEEDS_REVIEW rather than silently still TRUSTED.
    expect(results.some((r) => r.regressed)).toBe(true);
    expect(results[results.length - 1]!.newState).toBe('NEEDS_REVIEW');
  });

  it('only counts time-saved from usages with a known baseline time (sec. 43, baseline fairness)', () => {
    const shortcut = seedShortcut();
    recordUsage({ tenantId: 'test-tenant', studentId: 'stu-4', shortcutId: shortcut.shortcut_id, applied: true, correct: true, responseTimeMs: 5000, mode: 'PRACTICE' }); // no baseline
    const result = recordUsage({
      tenantId: 'test-tenant',
      studentId: 'stu-4',
      shortcutId: shortcut.shortcut_id,
      applied: true,
      correct: true,
      responseTimeMs: 5000,
      baselineTimeMs: 10000,
      mode: 'PRACTICE',
    });
    // Only the second usage has a baseline, so the average should reflect just that one comparison (0.5), not be diluted or null.
    expect(result.avgTimeSavedRatio).toBeCloseTo(0.5, 5);
  });
});
