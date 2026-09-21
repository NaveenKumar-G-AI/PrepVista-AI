export interface AnomalySignal {
  metric: string;
  scope: string;
  observedValue: number;
  baselineMean: number;
  baselineStdDev: number;
  zScore: number;
  message: string;
  detectedAt: string;
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Deliberately simple, explainable statistics — a rolling-window z-score,
 * not a black-box ML model this codebase can't justify the output of.
 * Flags a bucket as anomalous when it sits more than `zThreshold` standard
 * deviations from the trailing baseline, using neutral language ("usage
 * anomaly detected") rather than labeling it an attack — see the spec's
 * explicit instruction on this point. Requires a minimum history length
 * before it will flag anything, so a brand-new scope with two data points
 * doesn't immediately trip an alert.
 */
export class AnomalyDetector {
  detect(metric: string, scope: string, history: number[], latest: number, zThreshold = 3, minHistory = 8): AnomalySignal | null {
    if (history.length < minHistory) return null;

    const m = mean(history);
    const sd = stdDev(history, m);
    if (sd === 0) return null; // no variance to compare against — avoid divide-by-zero false positives

    const zScore = (latest - m) / sd;
    if (Math.abs(zScore) < zThreshold) return null;

    return {
      metric,
      scope,
      observedValue: latest,
      baselineMean: m,
      baselineStdDev: sd,
      zScore,
      message: `Usage anomaly detected for ${metric} in ${scope}.`,
      detectedAt: new Date().toISOString(),
    };
  }
}

export const anomalyDetector = new AnomalyDetector();
