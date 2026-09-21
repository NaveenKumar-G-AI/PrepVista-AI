import { describe, it, expect } from 'vitest';
import { DifficultyEstimator } from '../src/services/difficulty-estimator.service.js';
import type { EligibleObservation } from '../src/types/difficulty.types.js';

function obs(overrides: Partial<EligibleObservation> = {}): EligibleObservation {
  return {
    attemptId: crypto.randomUUID(),
    isCorrect: true,
    responseTimeMs: 45000,
    timeIsReliable: true,
    mode: 'UNTIMED',
    hintsUsed: 0,
    isNovel: true,
    exposureNumber: 1,
    sessionPositionPct: 0.5,
    abilityProxy: 0.5,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('DifficultyEstimator.computeFacility', () => {
  const est = new DifficultyEstimator();

  it('§176: a tiny sample stays low confidence even with a clean proportion', () => {
    const observations = [obs({ isCorrect: true }), obs({ isCorrect: true }), obs({ isCorrect: false })];
    const facility = est.computeFacility(observations);
    expect(facility.sampleSize).toBe(3);
    expect(facility.confidence).toBe('LOW');
  });

  it('§174: high facility on a well-powered sample', () => {
    const observations = Array.from({ length: 200 }, (_, i) => obs({ isCorrect: i % 10 !== 0 })); // 90%
    const facility = est.computeFacility(observations);
    expect(facility.facility).toBeCloseTo(0.9, 1);
    expect(facility.confidence).toBe('HIGH');
  });

  it('§175: low facility on a well-powered sample', () => {
    const observations = Array.from({ length: 200 }, (_, i) => obs({ isCorrect: i % 4 === 0 })); // 25%
    const facility = est.computeFacility(observations);
    expect(facility.facility).toBeCloseTo(0.25, 1);
  });
});

describe('DifficultyEstimator.compute — status and category', () => {
  const est = new DifficultyEstimator();

  it('§216: does not flip category off a handful of failing attempts', () => {
    const observations = [obs({ isCorrect: false }), obs({ isCorrect: false })];
    const result = est.compute({
      questionVersionId: 'q1',
      populationId: 'default',
      observations,
      initialCategory: 'EASY',
      contentHash: 'h1',
    });
    // Below categoryEmpiricalMin -> category stays the initial label, not HARD
    expect(result.category).toBe('EASY');
    expect(result.status).toBe('PROVISIONAL');
  });

  it('§32/§185: flags label mismatch once evidence is sufficient and clearly contradicts the author label', () => {
    const observations = Array.from({ length: 50 }, () => obs({ isCorrect: Math.random() < 0.1 })); // ~10% -> HARD
    const result = est.compute({
      questionVersionId: 'q2',
      populationId: 'default',
      observations,
      initialCategory: 'EASY',
      contentHash: 'h2',
    });
    expect(result.status).toBe('CALIBRATED');
    expect(result.category).toBe('HARD');
    expect(result.labelMismatch).toBe(true);
  });

  it('does not flag a mismatch when empirical evidence agrees with the initial label', () => {
    const observations = Array.from({ length: 50 }, () => obs({ isCorrect: Math.random() < 0.9 })); // ~90% -> EASY
    const result = est.compute({
      questionVersionId: 'q3',
      populationId: 'default',
      observations,
      initialCategory: 'EASY',
      contentHash: 'h3',
    });
    expect(result.labelMismatch).toBe(false);
  });

  it('§183: reaches CALIBRATED exactly at the configured sample-size threshold', () => {
    const observations = Array.from({ length: 30 }, () => obs({ isCorrect: true }));
    const result = est.compute({
      questionVersionId: 'q4',
      populationId: 'default',
      observations,
      initialCategory: null,
      contentHash: 'h4',
    });
    expect(result.status).toBe('CALIBRATED');
  });
});

describe('DifficultyEstimator.computeConditioned', () => {
  const est = new DifficultyEstimator();

  it('§180: only produces a TIMED/UNTIMED split once each side clears the conditioned-mode minimum', () => {
    const observations = [
      ...Array.from({ length: 10 }, () => obs({ mode: 'TIMED', isCorrect: false })), // below threshold
      ...Array.from({ length: 40 }, () => obs({ mode: 'UNTIMED', isCorrect: true })),
    ];
    const result = est.computeConditioned(observations);
    const modes = result.map((r) => r.mode);
    expect(modes).toContain('UNTIMED');
    expect(modes).not.toContain('TIMED');
  });

  it('produces both sides once both clear the threshold, and they can disagree', () => {
    const observations = [
      ...Array.from({ length: 40 }, () => obs({ mode: 'UNTIMED', isCorrect: true })), // ~100%
      ...Array.from({ length: 40 }, () => obs({ mode: 'TIMED', isCorrect: false })), // ~0%
    ];
    const result = est.computeConditioned(observations);
    const untimed = result.find((r) => r.mode === 'UNTIMED')!;
    const timed = result.find((r) => r.mode === 'TIMED')!;
    expect(untimed.facility.facility).toBeGreaterThan(0.9);
    expect(timed.facility.facility).toBeLessThan(0.1);
  });
});

describe('DifficultyEstimator.computeDiscrimination', () => {
  const est = new DifficultyEstimator();

  it('§69: returns unreliable below the discrimination sample-size minimum', () => {
    const observations = Array.from({ length: 10 }, () => obs({ abilityProxy: Math.random() }));
    const result = est.computeDiscrimination(observations);
    expect(result.reliable).toBe(false);
    expect(result.value).toBeNull();
  });

  it('§67: detects strong positive discrimination when correctness tracks ability', () => {
    const observations = Array.from({ length: 90 }, (_, i) => {
      const ability = i / 90;
      return obs({ abilityProxy: ability, isCorrect: Math.random() < ability });
    });
    const result = est.computeDiscrimination(observations);
    expect(result.reliable).toBe(true);
    expect(result.value).toBeGreaterThan(0.3);
  });

  it('§68: detects near-zero discrimination when correctness is independent of ability', () => {
    const observations = Array.from({ length: 90 }, () =>
      obs({ abilityProxy: Math.random(), isCorrect: Math.random() < 0.5 })
    );
    const result = est.computeDiscrimination(observations);
    expect(result.reliable).toBe(true);
    expect(Math.abs(result.value!)).toBeLessThan(0.3);
  });
});
