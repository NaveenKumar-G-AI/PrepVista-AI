import { MetricPoint } from "./types";

export interface ControlPoint {
  offsetMinutes: number;
  value: number;
}

export interface GenerateSeriesOptions {
  controlPoints: ControlPoint[]; // must be sorted ascending by offsetMinutes
  fromMinutes: number;
  toMinutes: number;
  stepMinutes: number;
  /** Deterministic pseudo-noise for chart realism. Same input -> same output, always. */
  wiggleAmplitude?: number;
  wiggleFrequencyPerMinute?: number;
  clampMin?: number;
  clampMax?: number;
  round?: number; // decimal places
}

function interpolate(controlPoints: ControlPoint[], t: number): number {
  if (controlPoints.length === 0) return 0;
  if (t <= controlPoints[0]!.offsetMinutes) return controlPoints[0]!.value;
  const last = controlPoints[controlPoints.length - 1]!;
  if (t >= last.offsetMinutes) return last.value;
  for (let i = 0; i < controlPoints.length - 1; i++) {
    const a = controlPoints[i]!;
    const b = controlPoints[i + 1]!;
    if (t >= a.offsetMinutes && t <= b.offsetMinutes) {
      const span = b.offsetMinutes - a.offsetMinutes;
      const frac = span === 0 ? 0 : (t - a.offsetMinutes) / span;
      return a.value + (b.value - a.value) * frac;
    }
  }
  return last.value;
}

/**
 * Deterministic "noise" — a fixed sum of sinusoids seeded by the offset
 * itself. NOT Math.random() and NOT time-seeded: calling this twice with
 * the same inputs always returns exactly the same series, which is what
 * makes evaluation reproducible (brief: "Do not allow uncontrolled
 * randomness to alter correctness").
 */
function deterministicWiggle(t: number, amplitude: number, freq: number): number {
  if (amplitude === 0) return 0;
  return amplitude * (0.6 * Math.sin(t * freq) + 0.4 * Math.sin(t * freq * 2.7 + 1.3));
}

/**
 * Applies a deterministic recovery blend on top of an authored "natural"
 * (unmitigated) series once a student takes a mitigating action. From
 * `mitigatedAtOffset` onward, values are linearly blended toward
 * `baselineValue` over `recoveryDurationMinutes`, then held flat at
 * baseline. Before `mitigatedAtOffset`, the natural series is returned
 * unchanged (so escalation-if-untouched still shows correctly for any
 * offset the student hasn't yet fixed).
 *
 * Pure function of its inputs — same instance state always produces the
 * same resulting series, which is what keeps evaluation reproducible even
 * though "when did the student act" varies per attempt.
 */
export function applyMitigationRecovery(
  natural: MetricPoint[],
  baselineValue: number,
  mitigatedAtOffset: number | null,
  recoveryDurationMinutes = 4
): MetricPoint[] {
  if (mitigatedAtOffset === null) return natural;
  return natural.map((p) => {
    if (p.offsetMinutes < mitigatedAtOffset) return p;
    const elapsed = p.offsetMinutes - mitigatedAtOffset;
    if (elapsed >= recoveryDurationMinutes) {
      return { offsetMinutes: p.offsetMinutes, value: baselineValue };
    }
    const frac = elapsed / recoveryDurationMinutes;
    const blended = p.value + (baselineValue - p.value) * frac;
    return { offsetMinutes: p.offsetMinutes, value: Math.round(blended * 100) / 100 };
  });
}

export function generateSeries(opts: GenerateSeriesOptions): MetricPoint[] {
  const {
    controlPoints,
    fromMinutes,
    toMinutes,
    stepMinutes,
    wiggleAmplitude = 0,
    wiggleFrequencyPerMinute = 0.9,
    clampMin,
    clampMax,
    round = 2,
  } = opts;

  const points: MetricPoint[] = [];
  const factor = Math.pow(10, round);
  for (let t = fromMinutes; t <= toMinutes + 1e-9; t += stepMinutes) {
    const base = interpolate(controlPoints, t);
    let value = base + deterministicWiggle(t, wiggleAmplitude, wiggleFrequencyPerMinute);
    if (clampMin !== undefined) value = Math.max(clampMin, value);
    if (clampMax !== undefined) value = Math.min(clampMax, value);
    points.push({ offsetMinutes: Math.round(t * 100) / 100, value: Math.round(value * factor) / factor });
  }
  return points;
}
