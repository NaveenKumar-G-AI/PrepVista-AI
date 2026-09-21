import { describe, expect, it } from 'vitest';
import { aggregateCohortReadiness } from '../src/domain/cohortAggregation';
import type { ReadinessResult } from '../src/domain/types';

function fakeResult(overrides: Partial<ReadinessResult>): ReadinessResult {
  return {
    studentId: 's1',
    organizationId: 'org1',
    roleId: 'role_backend_dev',
    roleName: 'Backend Developer',
    roleModelVersion: 'role-model-v1',
    algorithmVersion: 'readiness-algorithm-v1.0.0',
    readinessState: 'DEVELOPING',
    readinessScore: 40,
    confidence: 'medium',
    confidenceScore: 0.5,
    coverage: 0.5,
    coreGatePassed: false,
    strengths: [],
    blockers: [],
    skillBreakdown: [],
    warnings: [],
    evidenceTrace: [],
    calculatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('aggregateCohortReadiness', () => {
  it('returns an empty summary for an empty cohort', () => {
    const summary = aggregateCohortReadiness([]);
    expect(summary.totalStudents).toBe(0);
    expect(summary.mostCommonBlockers).toHaveLength(0);
  });

  it('counts students by readiness state', () => {
    const results = [
      fakeResult({ studentId: 's1', readinessState: 'READY' }),
      fakeResult({ studentId: 's2', readinessState: 'READY' }),
      fakeResult({ studentId: 's3', readinessState: 'DEVELOPING' }),
    ];
    const summary = aggregateCohortReadiness(results);
    expect(summary.totalStudents).toBe(3);
    expect(summary.byState.READY).toBe(2);
    expect(summary.byState.DEVELOPING).toBe(1);
    expect(summary.byState.STRONGLY_READY).toBe(0);
  });

  it('ranks the most common blockers across the cohort — the "SQL, Debugging, API Design" example', () => {
    const sqlBlocker = { skillId: 'sql', skillName: 'SQL', type: 'below_threshold' as const, severity: 'critical' as const, message: 'x' };
    const debugBlocker = { skillId: 'debug', skillName: 'Debugging', type: 'below_threshold' as const, severity: 'critical' as const, message: 'x' };

    const results = [
      fakeResult({ studentId: 's1', blockers: [sqlBlocker, debugBlocker] }),
      fakeResult({ studentId: 's2', blockers: [sqlBlocker] }),
      fakeResult({ studentId: 's3', blockers: [sqlBlocker] }),
    ];
    const summary = aggregateCohortReadiness(results);
    expect(summary.mostCommonBlockers[0]).toMatchObject({ skillId: 'sql', count: 3 });
    expect(summary.mostCommonBlockers[1]).toMatchObject({ skillId: 'debug', count: 1 });
  });
});
