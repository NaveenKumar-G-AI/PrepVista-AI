import { detectBottlenecks } from '../src/engines/bottleneckEngine';
import { detectRisks } from '../src/engines/riskEngine';

describe('detectBottlenecks (SS18, SS19)', () => {
  it('picks the highest-impact skill as primary, not just the lowest raw score', () => {
    // Probability has the lowest raw score, but DI costs far more
    // simulation time and has a real downstream accuracy effect - it
    // should win on impact even though its "weakness" number is milder.
    const result = detectBottlenecks([
      { skill: 'probability', weaknessSeverity: 35, simulationTimeCostRatio: 1.0, downstreamAccuracyEffect: 0.05 },
      { skill: 'data_interpretation', weaknessSeverity: 30, simulationTimeCostRatio: 1.34, downstreamAccuracyEffect: 0.5 },
    ]);
    expect(result.primary?.skill).toBe('data_interpretation');
    expect(result.chain.length).toBeGreaterThan(0);
  });

  it('returns nulls and an empty chain with no candidates', () => {
    const result = detectBottlenecks([]);
    expect(result.primary).toBeNull();
    expect(result.chain).toEqual([]);
  });
});

describe('detectRisks (SS20, SS21, SS23, SS24)', () => {
  it('flags TIME_MANAGEMENT_RISK from a high time ratio', () => {
    const risks = detectRisks({
      studentId: 's1',
      averageSimulationTimeRatio: 1.31,
      lateSessionDeclineRatio: null,
      retentionGapDays: null,
      retrievalDeclineDetected: false,
      simulationCount: 4,
      mildAccuracyDeclineDetected: false,
      responseTimeIncreaseDetected: false,
    });
    const risk = risks.find((r) => r.type === 'TIME_MANAGEMENT_RISK');
    expect(risk).toBeDefined();
    expect(risk?.severity).toBe('HIGH');
    expect(risk?.evidence.average_time_ratio).toBe(1.31);
  });

  it('raises EARLY_PERFORMANCE_RISK when several mild signals co-occur', () => {
    const risks = detectRisks({
      studentId: 's1',
      averageSimulationTimeRatio: null,
      lateSessionDeclineRatio: 0.05,
      retentionGapDays: null,
      retrievalDeclineDetected: true,
      simulationCount: 2,
      mildAccuracyDeclineDetected: true,
      responseTimeIncreaseDetected: true,
    });
    expect(risks.some((r) => r.type === 'EARLY_PERFORMANCE_RISK')).toBe(true);
  });

  it('produces no risks when every signal is clean', () => {
    const risks = detectRisks({
      studentId: 's1',
      averageSimulationTimeRatio: 1.0,
      lateSessionDeclineRatio: 0.02,
      retentionGapDays: 2,
      retrievalDeclineDetected: false,
      simulationCount: 5,
      mildAccuracyDeclineDetected: false,
      responseTimeIncreaseDetected: false,
    });
    expect(risks).toEqual([]);
  });
});
