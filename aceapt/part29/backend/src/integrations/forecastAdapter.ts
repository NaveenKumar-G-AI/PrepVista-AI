import { ForecastSignal } from '../domain/types';

/**
 * ALIGN <- FORECAST (spec §8, §27): "Forecast != proof. Do not treat
 * predictions as verified evidence." readinessCalculator.ts already caps
 * how much a forecast signal can move readiness (±0.05 on a 0..1 scale);
 * this adapter's only other job is failing safe. No Feature 27 to call
 * yet -> return an empty list, which readinessCalculator treats as
 * perfectly neutral (no adjustment at all), never as a penalty.
 */
export interface ForecastSource {
  getForecastSignals(studentId: string, targetId: string): Promise<ForecastSignal[]>;
}

export const noopForecastSource: ForecastSource = {
  async getForecastSignals(): Promise<ForecastSignal[]> {
    return [];
  },
};
