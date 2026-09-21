import { THRESHOLDS } from '../config/thresholds';
import { coefficientOfVariation, residualCoefficientOfVariation, TimeSeriesPoint } from './mathUtils';
import { VolatilityState } from '../types';

/**
 * SS22 Performance Volatility.
 * Two students can share an average and differ wildly in stability
 * (90/87/89/91 vs 55/95/61/93) - this measures the spread, not the
 * level. Use this for a set of comparable-condition observations with
 * no expected trend (e.g. repeated attempts at the same simulation).
 */
export function classifyVolatility(values: number[]): VolatilityState {
  if (values.length < 3) return 'INSUFFICIENT_EVIDENCE';
  const cv = coefficientOfVariation(values);
  const { stableCV, moderateCV } = THRESHOLDS.volatility;
  if (cv <= stableCV) return 'STABLE';
  if (cv <= moderateCV) return 'MODERATELY_VARIABLE';
  return 'HIGHLY_VARIABLE';
}

/**
 * Trend-aware variant used inside trajectory classification (SS9): how
 * noisy is the series *around its own trend line*, not around a flat
 * mean. A clean, strongly-trending series is STABLE by this measure
 * even though its raw values swing a lot; a series that bounces with no
 * consistent direction is HIGHLY_VARIABLE by this measure even if its
 * overall average looks unremarkable.
 */
export function classifyTrendVolatility(points: TimeSeriesPoint[]): VolatilityState {
  const cv = residualCoefficientOfVariation(points);
  if (cv === null) return 'INSUFFICIENT_EVIDENCE';
  const { stableCV, moderateCV } = THRESHOLDS.volatility;
  if (cv <= stableCV) return 'STABLE';
  if (cv <= moderateCV) return 'MODERATELY_VARIABLE';
  return 'HIGHLY_VARIABLE';
}
