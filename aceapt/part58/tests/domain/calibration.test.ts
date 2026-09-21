import { describe, expect, it } from 'vitest';
import { computeCalibrationByBand, detectMisalignment, MIN_SAMPLE_SIZE_FOR_CALIBRATION_INSIGHT } from '../../src/domain/calibration';
import type { CalibrationPoint } from '../../src/domain/calibration';
import { CONFIDENCE_BANDS } from '../../src/types';

function pointsFor(band: CalibrationPoint['band'], correctCount: number, total: number): CalibrationPoint[] {
  return Array.from({ length: total }, (_, i) => ({ band, isCorrect: i < correctCount }));
}

describe('computeCalibrationByBand', () => {
  it('computes accuracy per band and leaves untouched bands at zero sample size', () => {
    const points = [...pointsFor('HIGH', 8, 10)];
    const result = computeCalibrationByBand(points);
    expect(result.HIGH.sampleSize).toBe(10);
    expect(result.HIGH.accuracy).toBeCloseTo(0.8, 5);
    expect(result.LOW.sampleSize).toBe(0);
  });
});

describe('detectMisalignment', () => {
  it('does not flag a band below the minimum sample size, no matter how extreme the mismatch (§205)', () => {
    const observed = Object.fromEntries(CONFIDENCE_BANDS.map((b) => [b, { accuracy: 0, sampleSize: 0 }])) as ReturnType<
      typeof computeCalibrationByBand
    >;
    observed.VERY_HIGH = { accuracy: 0.1, sampleSize: MIN_SAMPLE_SIZE_FOR_CALIBRATION_INSIGHT - 1 };
    expect(detectMisalignment(observed)).toHaveLength(0);
  });

  it('flags overconfidence: VERY_HIGH band with low observed accuracy and enough samples', () => {
    const observed = Object.fromEntries(CONFIDENCE_BANDS.map((b) => [b, { accuracy: 0, sampleSize: 0 }])) as ReturnType<
      typeof computeCalibrationByBand
    >;
    observed.VERY_HIGH = { accuracy: 0.55, sampleSize: 20 }; // expected range for VERY_HIGH is 80-100%
    const result = detectMisalignment(observed);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ band: 'VERY_HIGH', type: 'OVERCONFIDENT' });
  });

  it('flags underconfidence: LOW band with high observed accuracy and enough samples', () => {
    const observed = Object.fromEntries(CONFIDENCE_BANDS.map((b) => [b, { accuracy: 0, sampleSize: 0 }])) as ReturnType<
      typeof computeCalibrationByBand
    >;
    observed.LOW = { accuracy: 0.88, sampleSize: 20 }; // expected range for LOW is 20-40%
    const result = detectMisalignment(observed);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ band: 'LOW', type: 'UNDERCONFIDENT' });
  });

  it('does not flag a band whose accuracy is within its expected range', () => {
    const observed = Object.fromEntries(CONFIDENCE_BANDS.map((b) => [b, { accuracy: 0, sampleSize: 0 }])) as ReturnType<
      typeof computeCalibrationByBand
    >;
    observed.MEDIUM = { accuracy: 0.5, sampleSize: 20 }; // expected range for MEDIUM is 40-60%
    expect(detectMisalignment(observed)).toHaveLength(0);
  });
});
