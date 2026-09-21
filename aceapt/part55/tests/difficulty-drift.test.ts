import { describe, it, expect } from 'vitest';
import { DifficultyDriftService } from '../src/services/difficulty-drift.service.js';
import { DifficultyEstimator } from '../src/services/difficulty-estimator.service.js';
import type { EligibleObservation } from '../src/types/difficulty.types.js';

function makeObservations(n: number, correctRate: number): EligibleObservation[] {
  return Array.from({ length: n }, () => ({
    attemptId: crypto.randomUUID(),
    isCorrect: Math.random() < correctRate,
    responseTimeMs: 40000,
    timeIsReliable: true,
    mode: 'UNTIMED',
    hintsUsed: 0,
    isNovel: true,
    exposureNumber: 1,
    sessionPositionPct: 0.5,
    abilityProxy: 0.5,
    createdAt: new Date(),
  }));
}

describe('DifficultyDriftService', () => {
  const svc = new DifficultyDriftService(new DifficultyEstimator());

  it('§185: detects drift on a large, clearly-shifted recent window', () => {
    const result = svc.evaluate({ facility: 0.8, sampleSize: 300 }, makeObservations(100, 0.4));
    expect(result.driftDetected).toBe(true);
    expect(result.pValue).toBeLessThan(0.01);
  });

  it('does not flag drift when the recent window matches the baseline', () => {
    const result = svc.evaluate({ facility: 0.8, sampleSize: 300 }, makeObservations(100, 0.8));
    expect(result.driftDetected).toBe(false);
  });

  it('§60-61: does not flag drift below the recent-sample-size floor, however different the rate looks', () => {
    const result = svc.evaluate({ facility: 0.8, sampleSize: 300 }, makeObservations(5, 0.2));
    expect(result.driftDetected).toBe(false);
  });

  it('requires both statistical significance AND a minimum absolute shift (huge-n triviality guard)', () => {
    // 0.80 vs 0.83 on huge samples can be "significant" by p-value alone but
    // is not a shift worth anyone's time.
    const result = svc.evaluate({ facility: 0.8, sampleSize: 5000 }, makeObservations(2000, 0.83));
    expect(result.absoluteShift).toBeLessThan(0.08);
    expect(result.driftDetected).toBe(false);
  });

  it('toAnomalyCandidate returns null when no drift detected', () => {
    const result = svc.evaluate({ facility: 0.8, sampleSize: 300 }, makeObservations(100, 0.8));
    expect(svc.toAnomalyCandidate(result)).toBeNull();
  });

  it('toAnomalyCandidate escalates severity for a very large shift', () => {
    const result = svc.evaluate({ facility: 0.9, sampleSize: 300 }, makeObservations(100, 0.3));
    const candidate = svc.toAnomalyCandidate(result);
    expect(candidate?.severity).toBe('HIGH');
  });
});
