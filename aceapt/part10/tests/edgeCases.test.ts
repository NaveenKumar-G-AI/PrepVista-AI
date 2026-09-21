import { generateForecast } from '../src/engines/forecastEngine';
import { classifyTrajectory } from '../src/engines/trajectoryService';
import { detectFalseMastery } from '../src/engines/falseMasteryDetector';
import { EvidenceBundle } from '../src/types';

function bundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    studentId: 'edge_student',
    readinessHistory: [],
    skillHistory: {},
    practiceScores: {},
    transferScores: {},
    simulationScores: {},
    simulationTimeRatios: {},
    lateSessionDeclineRatio: null,
    retentionGapDays: null,
    retrievalDeclineDetected: false,
    interventionHistory: [],
    target: null,
    lastActiveAt: null,
    ...overrides,
  };
}

describe('SS61 Edge cases', () => {
  it('brand-new student with zero history', () => {
    const forecast = generateForecast(bundle());
    expect(forecast.status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('one assessment only', () => {
    const forecast = generateForecast(
      bundle({ readinessHistory: [{ studentId: 'edge_student', metric: 'readiness', value: 60, timestamp: new Date().toISOString() }] })
    );
    expect(forecast.status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('no target configured still produces a forecast, just no target status beyond what evidence supports', () => {
    const history = [0, 1, 2, 3].map((i) => ({
      studentId: 'edge_student',
      metric: 'readiness',
      value: 60 + i * 3,
      timestamp: new Date(Date.now() - (4 - i) * 7 * 24 * 60 * 60 * 1000).toISOString(),
    }));
    const forecast = generateForecast(bundle({ readinessHistory: history, target: null }));
    expect(forecast.status).toBe('GENERATED');
    // targetScore defaults to 100 with no target configured, so gap-based
    // status still resolves without throwing.
    expect(['ON_TRACK', 'AT_RISK', 'BEHIND', 'INSUFFICIENT_EVIDENCE']).toContain(forecast.targetStatus);
  });

  it('target date already passed does not crash and still returns a valid status', () => {
    const history = [0, 1, 2, 3].map((i) => ({
      studentId: 'edge_student',
      metric: 'readiness',
      value: 70 + i,
      timestamp: new Date(Date.now() - (4 - i) * 7 * 24 * 60 * 60 * 1000).toISOString(),
    }));
    const forecast = generateForecast(
      bundle({
        readinessHistory: history,
        target: {
          studentId: 'edge_student',
          targetScore: 85,
          assessmentType: 'Placement Aptitude',
          targetDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
      })
    );
    expect(forecast.status).toBe('GENERATED');
    expect(Number.isFinite(forecast.evidenceCount)).toBe(true);
  });

  it('insufficient transfer evidence does not falsely trigger false mastery', () => {
    expect(detectFalseMastery('verbal', 91, null, null)).toBeNull();
  });

  it('sudden regression after long inactivity is classified as REGRESSING, not UPWARD', () => {
    const history = [83, 81, 75, 68].map((v, i) => ({
      studentId: 'edge_student',
      metric: 'readiness',
      value: v,
      timestamp: new Date(Date.now() - (4 - i) * 7 * 24 * 60 * 60 * 1000).toISOString(),
    }));
    expect(classifyTrajectory(history, 'readiness').state).toBe('REGRESSING');
  });

  it('duplicate timestamps do not throw (interrupted/duplicate session records)', () => {
    const now = new Date().toISOString();
    const history = [60, 62, 64].map((v) => ({ studentId: 'edge_student', metric: 'readiness', value: v, timestamp: now }));
    expect(() => classifyTrajectory(history, 'readiness')).not.toThrow();
  });
});
