import { describe, it, expect } from 'vitest';
import { selectVerificationPlan } from '../domain/targetedVerificationSelector.js';
import { DEFAULT_VERIFICATION_CONFIG } from '../domain/config.js';
import type { VerificationEvidence, VerificationRequirement } from '../domain/types.js';
import type { ForecastSignal } from '../domain/ports.js';

const requirement: VerificationRequirement = {
  id: 'req_1', targetId: 'target_1', capability: 'arrays', minPerformance: 0.8, minNovelty: 'NOVEL',
  minConsistency: 0.7, minTimedPerformance: 0.7, minConfidenceEvidence: 4, weight: 1, isActive: true,
  createdAt: new Date().toISOString(),
};

function strongEvidence(count: number, overrides: Partial<VerificationEvidence> = {}): VerificationEvidence[] {
  return Array.from({ length: count }).map((_, i) => ({
    id: `ev_${i}`, studentId: 's1', sessionId: null, sourceAttemptId: null, evidenceType: 'PRACTICE',
    capability: 'arrays', difficulty: 'HARD', novelty: 'HIGHLY_NOVEL', performance: 0.92,
    timeTakenMs: 55_000, expectedTimeMs: 60_000, isValid: true,
    quality: {
      recency: 0.9, diversity: 0.9, difficulty: 0.85, novelty: 0.9, independence: 0.8,
      timePressure: 0.9, targetRelevance: 0.85, repeatedPerformance: 0.92,
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  }));
}

const noSignalForecast: ForecastSignal = {
  studentId: 's1', targetId: 'target_1', readinessForecastPct: 0.7, targetPct: 0.8, mainUncertainty: null,
};

describe('selectVerificationPlan', () => {
  it('marks evidence as sufficient and skips a new session when already strongly verified with high confidence', () => {
    const plan = selectVerificationPlan({
      forecast: noSignalForecast, evidence: strongEvidence(15), requirement, config: DEFAULT_VERIFICATION_CONFIG,
      recentSessionCount7d: 0, minutesSinceLastSession: null,
    });
    expect(plan.evidenceSufficient).toBe(true);
  });

  it('uses the forecast-supplied uncertainty condition when present, ahead of any evidence-based fallback', () => {
    const forecast: ForecastSignal = { ...noSignalForecast, mainUncertainty: { capability: 'arrays', condition: 'TIME_PRESSURE' } };
    const plan = selectVerificationPlan({
      forecast, evidence: [], requirement, config: DEFAULT_VERIFICATION_CONFIG,
      recentSessionCount7d: 0, minutesSinceLastSession: null,
    });
    expect(plan.condition).toBe('TIME_PRESSURE');
  });

  it('falls back to the single weakest failing factor when the forecast has no uncertainty signal', () => {
    const evidence = strongEvidence(5, {
      timeTakenMs: null,
      expectedTimeMs: null,
      quality: {
        recency: 0.9, diversity: 0.9, difficulty: 0.85, novelty: 0.9, independence: 0.8,
        timePressure: 0.2, targetRelevance: 0.85, repeatedPerformance: 0.92,
      },
    });
    const plan = selectVerificationPlan({
      forecast: noSignalForecast, evidence, requirement, config: DEFAULT_VERIFICATION_CONFIG,
      recentSessionCount7d: 0, minutesSinceLastSession: null,
    });
    expect(plan.condition).toBe('TIME_PRESSURE');
    expect(plan.simulationProfile.mode).toBe('QUICK_VERIFICATION');
  });

  it('selects FULL_SIMULATION when uncertainty is spread across multiple factors at once', () => {
    const evidence = strongEvidence(5, { performance: 0.4, novelty: 'FAMILIAR', timeTakenMs: null, expectedTimeMs: null });
    const plan = selectVerificationPlan({
      forecast: noSignalForecast, evidence, requirement, config: DEFAULT_VERIFICATION_CONFIG,
      recentSessionCount7d: 0, minutesSinceLastSession: null,
    });
    expect(plan.simulationProfile.mode).toBe('FULL_SIMULATION');
  });

  it('downgrades to QUICK_VERIFICATION when the student is fatigued, even if the underlying gap is broad', () => {
    const evidence = strongEvidence(5, { performance: 0.4, novelty: 'FAMILIAR', timeTakenMs: null, expectedTimeMs: null });
    const plan = selectVerificationPlan({
      forecast: noSignalForecast, evidence, requirement, config: DEFAULT_VERIFICATION_CONFIG,
      recentSessionCount7d: 5, minutesSinceLastSession: null,
    });
    expect(plan.simulationProfile.mode).toBe('QUICK_VERIFICATION');
  });

  it('also downgrades to QUICK_VERIFICATION when the last session ended minutes ago', () => {
    const evidence = strongEvidence(5, { performance: 0.4, novelty: 'FAMILIAR', timeTakenMs: null, expectedTimeMs: null });
    const plan = selectVerificationPlan({
      forecast: noSignalForecast, evidence, requirement, config: DEFAULT_VERIFICATION_CONFIG,
      recentSessionCount7d: 0, minutesSinceLastSession: 5,
    });
    expect(plan.simulationProfile.mode).toBe('QUICK_VERIFICATION');
  });

  it('builds a STANDARD_VERIFICATION plan with no prior evidence at all', () => {
    const plan = selectVerificationPlan({
      forecast: noSignalForecast, evidence: [], requirement, config: DEFAULT_VERIFICATION_CONFIG,
      recentSessionCount7d: 0, minutesSinceLastSession: null,
    });
    expect(plan.simulationProfile.mode).toBe('STANDARD_VERIFICATION');
    expect(plan.evidenceSufficient).toBe(false);
  });

  it('selects FINAL_READINESS_CHECK when conditionally verified with reasonable confidence', () => {
    // 6 items, uniformly at 0.75 performance: Target Capability and Novel
    // Performance both narrowly miss the 0.8 bar while Timed/Consistency
    // clear it, landing the student at CONDITIONALLY_VERIFIED with MEDIUM
    // confidence — the "close, needs one more high-confidence check" case.
    const evidence = strongEvidence(6, { performance: 0.75 });
    const plan = selectVerificationPlan({
      forecast: noSignalForecast, evidence, requirement, config: DEFAULT_VERIFICATION_CONFIG,
      recentSessionCount7d: 0, minutesSinceLastSession: null,
    });
    expect(plan.simulationProfile.mode).toBe('FINAL_READINESS_CHECK');
  });
});
