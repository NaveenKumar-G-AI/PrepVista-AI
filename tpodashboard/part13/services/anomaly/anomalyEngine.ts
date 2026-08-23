// services/anomaly/anomalyEngine.ts
//
// Deterministic statistical helpers used by detectors. No LLM anywhere in
// this file (section 50) — the AI layer (Part 12) explains what these
// functions find; it never computes the numbers itself.

export interface SampleCheck {
  sufficient: boolean;
  sampleSize: number;
  minimumRequired: number;
  note?: string;
}

/** Section 52 — never assert a dramatic swing off a tiny denominator.
 * "Department performance collapsed 80%" off 5 students is noise, not
 * a finding. */
export function checkSampleSufficiency(sampleSize: number, minimumRequired = 10): SampleCheck {
  const sufficient = sampleSize >= minimumRequired;
  return {
    sufficient,
    sampleSize,
    minimumRequired,
    note: sufficient ? undefined : 'Insufficient sample for reliable anomaly detection.',
  };
}

export interface BaselineComparison {
  current: number;
  baseline: number;
  absoluteDelta: number;
  percentDelta: number | null; // null when baseline is 0 (undefined % change)
  isNotable: boolean; // crosses both a minimum-magnitude and minimum-sample bar
}

export interface BaselineOptions {
  minimumPercentDelta?: number; // default 20
  sampleSize?: number;
  minimumSampleSize?: number; // default 10
}

/** Section 51 — compares like-for-like periods. The caller picks a
 * comparable baseline (recent/season/department/institution); this
 * function only guards against tiny samples and noise-level swings, it
 * does not judge whether the two periods were fair to compare. */
export function compareToBaseline(
  current: number,
  baseline: number,
  options: BaselineOptions = {},
): BaselineComparison {
  const minimumPercentDelta = options.minimumPercentDelta ?? 20;
  const minimumSampleSize = options.minimumSampleSize ?? 10;
  const absoluteDelta = current - baseline;
  const percentDelta = baseline === 0 ? null : (absoluteDelta / baseline) * 100;

  const sampleOk = options.sampleSize === undefined ? true : options.sampleSize >= minimumSampleSize;
  const magnitudeOk =
    percentDelta === null ? absoluteDelta !== 0 : Math.abs(percentDelta) >= minimumPercentDelta;

  return {
    current,
    baseline,
    absoluteDelta,
    percentDelta,
    isNotable: sampleOk && magnitudeOk,
  };
}

export function zScore(value: number, mean: number, stdDev: number): number | null {
  if (stdDev === 0) return null;
  return (value - mean) / stdDev;
}

export type TrendDirection = 'DECLINE' | 'IMPROVEMENT' | 'PLATEAU' | 'VOLATILE' | 'INSUFFICIENT_DATA';

export interface TrendPoint {
  date: string;
  value: number;
}

/** Section 53 — a single day's movement is never a trend on its own; this
 * requires a sustained run across at least `minimumPoints` observations,
 * with at least 70% of the movements agreeing on direction. */
export function detectTrend(series: TrendPoint[], minimumPoints = 3): TrendDirection {
  if (series.length < minimumPoints) return 'INSUFFICIENT_DATA';

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    deltas.push(sorted[i].value - sorted[i - 1].value);
  }

  const positive = deltas.filter((d) => d > 0).length;
  const negative = deltas.filter((d) => d < 0).length;
  const flat = deltas.filter((d) => d === 0).length;

  const threshold = Math.ceil(deltas.length * 0.7);
  if (negative >= threshold) return 'DECLINE';
  if (positive >= threshold) return 'IMPROVEMENT';
  if (flat >= threshold) return 'PLATEAU';
  return 'VOLATILE';
}
