import { classifyTrajectory } from '../src/engines/trajectoryService';
import { analyzeMomentum } from '../src/engines/momentumAnalyzer';
import { classifyVolatility } from '../src/engines/volatilityService';
import { detectRegression } from '../src/engines/regressionDetector';
import { detectFalseMastery } from '../src/engines/falseMasteryDetector';
import { computeConfidence } from '../src/engines/confidenceEngine';
import { TrajectoryPoint } from '../src/types';

function points(values: number[]): TrajectoryPoint[] {
  return values.map((v, i) => ({
    studentId: 's1',
    metric: 'readiness',
    value: v,
    timestamp: new Date(Date.now() - (values.length - i) * 7 * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

describe('classifyTrajectory (SS9)', () => {
  it('returns INSUFFICIENT_EVIDENCE with fewer than 3 points', () => {
    expect(classifyTrajectory(points([60, 65]), 'readiness').state).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('classifies a clear upward trend (42->57->71->83)', () => {
    const result = classifyTrajectory(points([42, 57, 71, 83]), 'readiness');
    expect(result.state).toBe('UPWARD');
    expect(result.slopePerWeek).toBeGreaterThan(0);
  });

  it('classifies a stable trend', () => {
    expect(classifyTrajectory(points([70, 71, 69, 70, 71]), 'readiness').state).toBe('STABLE');
  });

  it('classifies sustained regression (83->81->75->68)', () => {
    expect(classifyTrajectory(points([83, 81, 75, 68]), 'readiness').state).toBe('REGRESSING');
  });

  it('classifies high volatility as UNSTABLE even with a rising average', () => {
    expect(classifyTrajectory(points([55, 95, 61, 93, 58, 90]), 'readiness').state).toBe('UNSTABLE');
  });

  it('never returns a numeric slope for INSUFFICIENT_EVIDENCE (no fake precision)', () => {
    const result = classifyTrajectory(points([60]), 'readiness');
    expect(result.slopePerWeek).toBeNull();
  });
});

describe('analyzeMomentum (SS11)', () => {
  it('reads steady positive momentum as STABLE (spec SS11 example: 60->68->77->84, "positive momentum")', () => {
    expect(analyzeMomentum(points([60, 68, 77, 84]), 'readiness').state).toBe('STABLE');
  });

  it('detects real acceleration when each gain is clearly larger than the last (60->65->73->84)', () => {
    expect(analyzeMomentum(points([60, 65, 73, 84]), 'readiness').state).toBe('ACCELERATING');
  });

  it('detects slowing improvement (60->70->74->76) exactly as SS11 labels it - still net positive, not reversing', () => {
    expect(analyzeMomentum(points([60, 70, 74, 76]), 'readiness').state).toBe('SLOWING');
  });

  it('only calls it REVERSING when the latest interval is an actual decline', () => {
    expect(analyzeMomentum(points([80, 85, 88, 84]), 'readiness').state).toBe('REVERSING');
  });

  it('returns INSUFFICIENT_EVIDENCE with fewer than 4 points', () => {
    expect(analyzeMomentum(points([60, 65, 70]), 'readiness').state).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('classifyVolatility (SS22)', () => {
  it('flags a volatile student even when the average matches a stable one', () => {
    const stable = classifyVolatility([90, 87, 89, 91]);
    const volatile = classifyVolatility([55, 95, 61, 93]);
    expect(stable).toBe('STABLE');
    expect(volatile).toBe('HIGHLY_VARIABLE');
  });
});

describe('detectRegression (SS12)', () => {
  it('flags sustained drops and never claims causation outright', () => {
    const result = detectRegression(points([83, 81, 75, 68]), 'readiness', { retrievalDeclineDetected: true });
    expect(result.detected).toBe(true);
    expect(result.possibleContributors.every((c) => c.factor && c.strength)).toBe(true);
  });

  it('does not flag a single noisy dip', () => {
    const result = detectRegression(points([80, 82, 81, 83]), 'readiness');
    expect(result.detected).toBe(false);
  });
});

describe('detectFalseMastery (SS13)', () => {
  it('flags a large practice-vs-transfer gap', () => {
    const result = detectFalseMastery('data_interpretation', 92, 68, 64);
    expect(result?.detected).toBe(true);
    expect(result?.gap).toBeGreaterThanOrEqual(15);
  });

  it('does not flag well-aligned scores', () => {
    const result = detectFalseMastery('arithmetic', 88, 84, 82);
    expect(result?.detected).toBe(false);
  });

  it('returns null with no comparison evidence', () => {
    expect(detectFalseMastery('verbal', 90, null, null)).toBeNull();
  });
});

describe('computeConfidence (SS14, SS36)', () => {
  it('returns INSUFFICIENT_EVIDENCE with zero evidence', () => {
    const result = computeConfidence({
      evidenceCount: 0,
      mostRecentEvidenceDaysAgo: null,
      volatilityCV: null,
      distinctSkillsCovered: 0,
      expectedSkillsCovered: 5,
    });
    expect(result.level).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.score).toBeNull();
  });

  it('rewards recent, consistent, diverse, high-volume evidence with HIGH confidence', () => {
    const result = computeConfidence({
      evidenceCount: 10,
      mostRecentEvidenceDaysAgo: 1,
      volatilityCV: 0.05,
      distinctSkillsCovered: 5,
      expectedSkillsCovered: 5,
    });
    expect(result.level).toBe('HIGH');
  });
});
