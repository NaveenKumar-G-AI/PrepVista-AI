import { describe, it, expect } from 'vitest';
import { DifficultyAnomalyService } from '../src/services/difficulty-anomaly.service.js';
import type { CalibrationComputation } from '../src/types/difficulty.types.js';

function computation(overrides: Partial<CalibrationComputation> = {}): CalibrationComputation {
  return {
    questionVersionId: 'q1',
    populationId: 'default',
    overall: {
      mode: 'OVERALL',
      facility: { facility: 0.5, ciLow: 0.4, ciHigh: 0.6, sampleSize: 100, confidence: 'HIGH' },
      time: { medianMs: 50000, p25Ms: 40000, p75Ms: 60000, sampleSize: 100, reliable: true, outliersDropped: 0 },
    },
    conditioned: [],
    discrimination: { value: 0.2, sampleSize: 60, reliable: true },
    status: 'CALIBRATED',
    category: 'MEDIUM',
    initialCategory: 'MEDIUM',
    labelMismatch: false,
    contentHash: 'h',
    ...overrides,
  };
}

describe('DifficultyAnomalyService.detect', () => {
  const svc = new DifficultyAnomalyService({} as never); // detect() is pure, no DB needed

  it('§186: flags TOO_EASY at extreme facility', () => {
    const c = computation({
      overall: {
        mode: 'OVERALL',
        facility: { facility: 0.99, ciLow: 0.97, ciHigh: 1, sampleSize: 200, confidence: 'HIGH' },
        time: computation().overall.time,
      },
    });
    const anomalies = svc.detect(c);
    expect(anomalies.map((a) => a.type)).toContain('TOO_EASY');
  });

  it('§65: flags TOO_HARD at extreme low facility', () => {
    const c = computation({
      overall: {
        mode: 'OVERALL',
        facility: { facility: 0.03, ciLow: 0, ciHigh: 0.06, sampleSize: 200, confidence: 'HIGH' },
        time: computation().overall.time,
      },
    });
    const anomalies = svc.detect(c);
    expect(anomalies.map((a) => a.type)).toContain('TOO_HARD');
  });

  it('does not flag TOO_EASY/TOO_HARD while still PROVISIONAL', () => {
    const c = computation({ status: 'PROVISIONAL' });
    const anomalies = svc.detect({
      ...c,
      overall: {
        mode: 'OVERALL',
        facility: { facility: 0.99, ciLow: 0.9, ciHigh: 1, sampleSize: 3, confidence: 'LOW' },
        time: c.overall.time,
      },
    });
    expect(anomalies.map((a) => a.type)).not.toContain('TOO_EASY');
  });

  it('§32: flags LABEL_MISMATCH when the computation says so', () => {
    const c = computation({ labelMismatch: true, category: 'HARD', initialCategory: 'EASY' });
    const anomalies = svc.detect(c);
    const mismatch = anomalies.find((a) => a.type === 'LABEL_MISMATCH');
    expect(mismatch).toBeDefined();
    expect(mismatch!.details.initialCategory).toBe('EASY');
    expect(mismatch!.details.empiricalCategory).toBe('HARD');
  });

  it('§68: flags WEAK_DISCRIMINATION near zero', () => {
    const c = computation({ discrimination: { value: 0.02, sampleSize: 60, reliable: true } });
    const anomalies = svc.detect(c);
    expect(anomalies.map((a) => a.type)).toContain('WEAK_DISCRIMINATION');
  });

  it('§66: flags HIGH_VARIANCE at a large discrimination gap', () => {
    const c = computation({ discrimination: { value: 0.6, sampleSize: 60, reliable: true } });
    const anomalies = svc.detect(c);
    expect(anomalies.map((a) => a.type)).toContain('HIGH_VARIANCE');
  });

  it('§63: flags UNEXPECTEDLY_SLOW when median time roughly doubles vs. previous', () => {
    const c = computation();
    const anomalies = svc.detect(c, { previousMedianTimeMs: 20000 }); // now 50000, ratio 2.5x
    expect(anomalies.map((a) => a.type)).toContain('UNEXPECTEDLY_SLOW');
  });

  it('does not flag unexpected time when no previous baseline exists', () => {
    const c = computation();
    const anomalies = svc.detect(c, {});
    expect(anomalies.map((a) => a.type)).not.toContain('UNEXPECTEDLY_SLOW');
    expect(anomalies.map((a) => a.type)).not.toContain('UNEXPECTEDLY_FAST');
  });

  it('never emits INSUFFICIENT_DATA as an anomaly row (it is a snapshot status, not an event)', () => {
    const c = computation({ status: 'PROVISIONAL' });
    const anomalies = svc.detect(c);
    expect(anomalies.map((a) => a.type)).not.toContain('INSUFFICIENT_DATA');
  });
});
