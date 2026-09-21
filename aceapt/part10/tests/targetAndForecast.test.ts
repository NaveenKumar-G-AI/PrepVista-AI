import { assessTargetReadiness } from '../src/engines/targetReadinessService';
import { generateForecast } from '../src/engines/forecastEngine';
import { DemoAdapter } from '../src/integrations/demoAdapter';
import { EvidenceBundle } from '../src/types';

describe('assessTargetReadiness (SS15, SS16, SS17)', () => {
  it('never claims certainty - message language stays hedged for AT_RISK', () => {
    const result = assessTargetReadiness({
      currentReadiness: 72,
      targetScore: 85,
      targetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      trajectoryState: 'UPWARD',
      slopePerWeek: 1,
      confidenceIsSufficient: true,
    });
    expect(['ON_TRACK', 'AT_RISK', 'BEHIND']).toContain(result.status);
    expect(result.message.toLowerCase()).not.toMatch(/will (definitely|certainly)/);
  });

  it('returns BEHIND, not a guess, when trajectory is regressing with a near deadline', () => {
    const result = assessTargetReadiness({
      currentReadiness: 68,
      targetScore: 85,
      targetDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      trajectoryState: 'REGRESSING',
      slopePerWeek: -1.5,
      confidenceIsSufficient: true,
    });
    expect(result.status).toBe('BEHIND');
  });

  it('returns INSUFFICIENT_EVIDENCE rather than fabricating a time estimate', () => {
    const result = assessTargetReadiness({
      currentReadiness: 60,
      targetScore: 85,
      targetDate: null,
      trajectoryState: 'INSUFFICIENT_EVIDENCE',
      slopePerWeek: null,
      confidenceIsSufficient: false,
    });
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.estimatedWeeksToTarget).toBeNull();
  });
});

describe('generateForecast (SS34-SS39, cold start & full demo bundle)', () => {
  it('SS39 cold start: brand-new student with <3 readiness points returns INSUFFICIENT_EVIDENCE, not a guess', () => {
    const emptyBundle: EvidenceBundle = {
      studentId: 'new_student',
      readinessHistory: [{ studentId: 'new_student', metric: 'readiness', value: 55, timestamp: new Date().toISOString() }],
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
    };
    const forecast = generateForecast(emptyBundle);
    expect(forecast.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(forecast.predictedValue).toBeNull();
    expect(forecast.confidence).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('generates a full forecast from the SS63 demo BEFORE bundle with primary bottleneck and risks populated', async () => {
    const adapter = new DemoAdapter();
    const bundle = await adapter.buildEvidenceBundle('demo_student');
    const forecast = generateForecast(bundle);

    expect(forecast.status).toBe('GENERATED');
    expect(forecast.predictedValue).not.toBeNull();
    expect(forecast.bottlenecks.primary).not.toBeNull();
    expect(forecast.risks.length).toBeGreaterThan(0);
    // Client can never influence this - it is entirely server-computed.
    expect(typeof forecast.predictedValue).toBe('number');
  });

  it('SS63 narrative: readiness forecast improves after the intervention loop runs', async () => {
    const adapter = new DemoAdapter();
    const before = generateForecast(await adapter.buildEvidenceBundle('demo_student'));

    adapter.advanceToAfterIntervention();
    const after = generateForecast(await adapter.buildEvidenceBundle('demo_student'));

    expect(after.predictedValue!).toBeGreaterThan(before.predictedValue!);
  });
});
