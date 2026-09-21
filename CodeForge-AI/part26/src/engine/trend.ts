import { Trend, type SkillSignalHistoryPoint } from '../domain/models.js';
import { SignalPolicy } from '../policy/policy.js';

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Ordinary least squares slope of signal over successive observation index
 * (not calendar time — see req #27, the example is step-indexed: "0.42 -> 0.49 -> 0.58"). */
function olsSlope(values: number[]): number {
  const n = values.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (values[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export interface TrendResult {
  trend: Trend;
  slope: number | null;
  volatility: number | null;
}

/**
 * history must be ordered oldest -> newest and should include the point about
 * to be persisted (or not — callers may pass prior history only; either is a
 * legitimate trend read, just phrased relative to a different "now").
 */
export function computeTrend(history: SkillSignalHistoryPoint[]): TrendResult {
  const { minHistoryPoints, improveSlopeThreshold, declineSlopeThreshold, volatilityStdDevThreshold } = SignalPolicy.trend;

  if (history.length < minHistoryPoints) {
    return { trend: Trend.INSUFFICIENT_DATA, slope: null, volatility: null };
  }

  const values = history.map((h) => h.signal);
  const volatility = stddev(values);

  // Volatility is checked first and independently of slope: "0.81, 0.44, 0.79, 0.38, 0.82"
  // is "strong but unstable", not weak and not confidently improving/declining (req #28).
  if (volatility > volatilityStdDevThreshold) {
    return { trend: Trend.VOLATILE, slope: olsSlope(values), volatility };
  }

  const slope = olsSlope(values);
  if (slope >= improveSlopeThreshold) return { trend: Trend.IMPROVING, slope, volatility };
  if (slope <= declineSlopeThreshold) return { trend: Trend.DECLINING, slope, volatility };
  return { trend: Trend.STABLE, slope, volatility };
}
