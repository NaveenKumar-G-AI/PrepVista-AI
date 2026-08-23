import { test } from "node:test";
import assert from "node:assert/strict";
import { ForecastService } from "../../services/forecast/ForecastService.js";
import { DemoPlacementDataRepository } from "../../repository/demo/DemoPlacementDataRepository.js";
import { DATA_CUTOFF } from "../../repository/demo/seed.js";

test("department with < 15 students returns dataAvailable:false, never a fabricated number", async () => {
  const repo = new DemoPlacementDataRepository();
  const forecastService = new ForecastService(repo);
  const forecast = await forecastService.getDepartmentForecast("AI_DS", DATA_CUTOFF);

  assert.equal(forecast.dataAvailable, false);
  assert.equal(forecast.pointEstimate, undefined, "must not return a point estimate when data is insufficient");
  assert.equal(forecast.range, undefined, "must not return a range when data is insufficient");
  assert.match(forecast.reason ?? "", /insufficient_sample/);
  assert.match(forecast.reason ?? "", /Institution-level forecast available/);
});

test("a department well above the sample threshold DOES get a real forecast", async () => {
  const repo = new DemoPlacementDataRepository();
  const forecastService = new ForecastService(repo);
  const forecast = await forecastService.getDepartmentForecast("CSE", DATA_CUTOFF);

  assert.equal(forecast.dataAvailable, true);
  assert.equal(typeof forecast.pointEstimate, "number");
  assert.ok(forecast.range && forecast.range.low <= forecast.pointEstimate! && forecast.pointEstimate! <= forecast.range.high);
});

test("institution-level forecast (large N) is always available", async () => {
  const repo = new DemoPlacementDataRepository();
  const forecastService = new ForecastService(repo);
  const forecast = await forecastService.getPlacementForecast(DATA_CUTOFF);

  assert.equal(forecast.dataAvailable, true);
  assert.equal(typeof forecast.pointEstimate, "number");
});
