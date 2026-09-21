import type { PathSnapshot } from "../domain/types.js";

export interface RawForecast {
  weeksLow: number | null;
  weeksHigh: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  basis: string;
}

/**
 * Stand-in for ACEAPT's real FORECAST feature (Section 6: "never create
 * parallel versions of existing business logic"). PATH's own job is to
 * *use* a projection, not compute one from scratch -- this client exists
 * so PATH is exercisable standalone. Swap this file's implementation for a
 * real call to the FORECAST service (FORECAST_SERVICE_URL) when this
 * lands in the live ACEAPT backend; nothing else in PATH needs to change,
 * because everything downstream only depends on the RawForecast shape.
 *
 * The trend model here is deliberately simple (linear regression over
 * recent readiness snapshots) -- FORECAST's real model is presumably far
 * richer. What matters for PATH's contract is the shape and the honesty
 * discipline: never a guaranteed date, confidence drops with thin data.
 */
export async function getForecastProjection(
  snapshots: PathSnapshot[],
  currentReadiness: number,
  targetReadiness: number
): Promise<RawForecast> {
  const distance = Math.max(0, targetReadiness - currentReadiness);
  if (distance === 0) {
    return { weeksLow: 0, weeksHigh: 0, confidence: "HIGH", basis: "Target readiness already met." };
  }

  if (snapshots.length < 3) {
    return {
      weeksLow: null,
      weeksHigh: null,
      confidence: "LOW",
      basis: "Not enough recalculation history yet to project a trend.",
    };
  }

  // weeks-since-first-snapshot vs readiness, simple linear fit
  const t0 = new Date(snapshots[0].takenAt).getTime();
  const points = snapshots.map((s) => ({
    weeks: (new Date(s.takenAt).getTime() - t0) / (7 * 24 * 3600 * 1000),
    readiness: s.readiness,
  }));

  const n = points.length;
  const sumX = points.reduce((a, p) => a + p.weeks, 0);
  const sumY = points.reduce((a, p) => a + p.readiness, 0);
  const sumXY = points.reduce((a, p) => a + p.weeks * p.readiness, 0);
  const sumXX = points.reduce((a, p) => a + p.weeks * p.weeks, 0);
  const denom = n * sumXX - sumX * sumX;
  const slopePerWeek = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;

  if (slopePerWeek <= 0.05) {
    return {
      weeksLow: null,
      weeksHigh: null,
      confidence: "LOW",
      basis: "Readiness trend over recent recalculations is flat or negative -- no reliable forward projection.",
    };
  }

  const weeksCentral = distance / slopePerWeek;
  // Residual spread widens the window and lowers confidence -- a noisy
  // trend earns a wider, less confident window rather than a false-precise one.
  const predicted = points.map((p) => sumY / n + slopePerWeek * (p.weeks - sumX / n));
  const residuals = points.map((p, i) => p.readiness - predicted[i]);
  const rmse = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / n);
  const noiseRatio = rmse / Math.max(1, distance);

  const spreadFactor = 0.15 + Math.min(0.6, noiseRatio * 2);
  const weeksLow = Math.max(0.5, weeksCentral * (1 - spreadFactor));
  const weeksHigh = weeksCentral * (1 + spreadFactor);

  const confidence: RawForecast["confidence"] = n >= 6 && noiseRatio < 0.3 ? "HIGH" : n >= 4 && noiseRatio < 0.6 ? "MEDIUM" : "LOW";

  return {
    weeksLow: Math.round(weeksLow),
    weeksHigh: Math.round(weeksHigh * 10) / 10,
    confidence,
    basis: `Linear trend across ${n} recalculations, ${slopePerWeek.toFixed(1)} readiness points/week.`,
  };
}
