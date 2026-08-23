/**
 * PrepVista AI — Part 15
 * Tracks forecast-vs-actual once outcomes are observed (Section 23/24/56).
 * In-memory store for this build — production should persist to the
 * `forecast_performance` table defined in migrations/0001_*.sql so history
 * survives restarts and can be queried across seasons.
 */

import type { ForecastEnvelope, ForecastPerformanceRecord, TargetMetric } from "../../types/placement-strategy.types.js";
import { meanAbsoluteError, round1 } from "./stats.js";
import { emitEvent } from "../../events/event-bus.js";

export class ForecastPerformanceService {
  private records: ForecastPerformanceRecord[] = [];
  private idCounter = 0;

  recordForecast(metric: TargetMetric, scope: "INSTITUTION" | string, forecast: ForecastEnvelope): string | null {
    if (!forecast.dataAvailable || forecast.pointEstimate === undefined || !forecast.range) return null;
    const id = `fc-${++this.idCounter}`;
    // Stored as a pending record; `actualValue` is filled in later via recordActual.
    this.records.push({
      forecastId: id,
      metric,
      scope,
      forecastedAt: forecast.generatedAt,
      forecastPointEstimate: forecast.pointEstimate,
      forecastRange: forecast.range,
      modelVersion: forecast.modelVersion,
      actualValue: NaN,
      actualObservedAt: "",
      absoluteError: NaN,
      withinRange: false,
    });
    emitEvent("FORECAST_CREATED", { forecastId: id, metric, scope, pointEstimate: forecast.pointEstimate });
    return id;
  }

  recordActual(forecastId: string, actualValue: number, actualObservedAt: string): ForecastPerformanceRecord | null {
    const record = this.records.find((r) => r.forecastId === forecastId);
    if (!record) return null;
    record.actualValue = actualValue;
    record.actualObservedAt = actualObservedAt;
    record.absoluteError = round1(Math.abs(actualValue - record.forecastPointEstimate));
    record.withinRange = actualValue >= record.forecastRange.low && actualValue <= record.forecastRange.high;
    if (record.absoluteError > 5) {
      emitEvent("FORECAST_ERROR_DETECTED", { forecastId, absoluteError: record.absoluteError });
    }
    return record;
  }

  getResolvedRecords(): ForecastPerformanceRecord[] {
    return this.records.filter((r) => !Number.isNaN(r.actualValue));
  }

  getAccuracySummary(): { count: number; mae: number; coverageRate: number } {
    const resolved = this.getResolvedRecords();
    if (resolved.length === 0) return { count: 0, mae: NaN, coverageRate: NaN };
    return {
      count: resolved.length,
      mae: round1(meanAbsoluteError(resolved.map((r) => r.absoluteError))),
      coverageRate: round1((resolved.filter((r) => r.withinRange).length / resolved.length) * 100),
    };
  }
}
