import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoPlacementDataRepository } from "../../repository/demo/DemoPlacementDataRepository.js";
import { ForecastService } from "../../services/forecast/ForecastService.js";
import { ForecastPerformanceService } from "../../services/forecast/ForecastPerformanceService.js";
import { DATA_CUTOFF } from "../../repository/demo/seed.js";

test("baseline method backtest produces a finite, non-negative MAE across historical seasons", async () => {
  const repo = new DemoPlacementDataRepository();
  const forecastService = new ForecastService(repo);
  const { components } = await forecastService.computeInstitutionForecastComponents(DATA_CUTOFF);

  assert.equal(components.historicalSeasonCount, 4);
  assert.ok(Number.isFinite(components.backtestMAE), "MAE must be a real number, not NaN, with 4 historical seasons available");
  assert.ok(components.backtestMAE >= 0);
  assert.ok(components.backtestMAE < 10, "sanity ceiling — a well-behaved backtest on smoothly-trending demo data shouldn't blow up");
});

test("forecast confidence degrades to LOW when data is DELAYED regardless of sample size", async () => {
  const repo = new DemoPlacementDataRepository();
  const forecastService = new ForecastService(repo);
  const original = repo.getCurrentSeasonSnapshot.bind(repo);
  repo.getCurrentSeasonSnapshot = async (asOf: string) => {
    const snap = await original(asOf);
    return { ...snap, freshnessStatus: "DELAYED" as const };
  };

  const forecast = await forecastService.getPlacementForecast(DATA_CUTOFF);
  assert.equal(forecast.confidence, "LOW");
  assert.equal(forecast.freshness, "DELAYED");
});

test("poor live tracked accuracy downgrades confidence even when the historical backtest alone would support HIGH", async () => {
  const repo = new DemoPlacementDataRepository();
  const performance = new ForecastPerformanceService();
  const forecastService = new ForecastService(repo, performance);

  const withoutLiveHistory = await forecastService.getPlacementForecast(DATA_CUTOFF);
  assert.equal(withoutLiveHistory.confidence, "HIGH", "sanity: backtest alone supports HIGH for this dataset");

  // Manually seed 3 badly-missed past forecasts (MAE well above the 6-point cap).
  for (let i = 0; i < 3; i++) {
    const id = performance.recordForecast("PLACEMENT_PCT", "INSTITUTION", { ...withoutLiveHistory, pointEstimate: 80 });
    performance.recordActual(id!, 92, "2027-06-01"); // 12-point miss each time
  }

  const withBadLiveHistory = await forecastService.getPlacementForecast(DATA_CUTOFF);
  assert.equal(withBadLiveHistory.confidence, "LOW");
  assert.ok(withBadLiveHistory.limitations.some((l) => /[Ll]ive tracked MAE/.test(l)));
});

test("ForecastPerformanceService records forecast-vs-actual and computes MAE/coverage once resolved", async () => {
  const repo = new DemoPlacementDataRepository();
  const forecastService = new ForecastService(repo);
  const performance = new ForecastPerformanceService();

  const forecast = await forecastService.getPlacementForecast(DATA_CUTOFF);
  const id = performance.recordForecast("PLACEMENT_PCT", "INSTITUTION", forecast);
  assert.ok(id);

  assert.deepEqual(performance.getAccuracySummary(), { count: 0, mae: NaN, coverageRate: NaN });

  const resolved = performance.recordActual(id!, forecast.pointEstimate! + 0.5, "2027-06-01");
  assert.ok(resolved);
  assert.equal(resolved!.absoluteError, 0.5);
  assert.equal(resolved!.withinRange, resolved!.actualValue <= forecast.range!.high && resolved!.actualValue >= forecast.range!.low);

  const summary = performance.getAccuracySummary();
  assert.equal(summary.count, 1);
  assert.equal(summary.mae, 0.5);
});
