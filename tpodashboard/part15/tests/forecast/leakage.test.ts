import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoPlacementDataRepository } from "../../repository/demo/DemoPlacementDataRepository.js";
import { ForecastService } from "../../services/forecast/ForecastService.js";
import { DATA_CUTOFF } from "../../repository/demo/seed.js";

// The demo repository holds 4 joining confirmations recorded on 2026-08-15 —
// two days AFTER the stated data cutoff of 2026-08-13. This proves a forecast
// asked for "as of 13 Aug" cannot see them, even though the in-memory process
// has had that data the whole time (Section 19 — Data Leakage Prevention).

test("current-season snapshot excludes records dated after the requested cutoff", async () => {
  const repo = new DemoPlacementDataRepository();
  const atCutoff = await repo.getCurrentSeasonSnapshot(DATA_CUTOFF);
  const afterLateBatch = await repo.getCurrentSeasonSnapshot("2026-08-20");

  assert.equal(atCutoff.verifiedPlacements, 941, "verifiedPlacements at the stated cutoff must be exactly the pre-late-batch count");
  assert.equal(afterLateBatch.verifiedPlacements, 945, "a later asOf legitimately sees the +4 late batch");
  assert.ok(afterLateBatch.verifiedPlacements > atCutoff.verifiedPlacements, "sanity: the two snapshots must actually differ, or this test would pass vacuously");
});

test("department-level state excludes the same late batch at the stated cutoff", async () => {
  const repo = new DemoPlacementDataRepository();
  const atCutoff = await repo.getDepartmentSeasonState("CSE", "2026", DATA_CUTOFF);
  const afterLateBatch = await repo.getDepartmentSeasonState("CSE", "2026", "2026-08-20");

  assert.equal(atCutoff.verifiedPlacements, 270);
  assert.equal(afterLateBatch.verifiedPlacements, 274);
});

test("a forecast computed as of the data cutoff is unaffected by data recorded after it", async () => {
  const repo = new DemoPlacementDataRepository();
  const forecastService = new ForecastService(repo);

  const atCutoff = await forecastService.getPlacementForecast(DATA_CUTOFF);
  assert.equal(atCutoff.dataThrough, DATA_CUTOFF);
  assert.equal(atCutoff.sampleSize, 1200);

  // Recompute the raw components directly against the cutoff snapshot to
  // confirm the 941 baseline (not 945) is what actually fed the forecast math.
  const { snapshot } = await forecastService.computeInstitutionForecastComponents(DATA_CUTOFF);
  assert.equal(snapshot.verifiedPlacements, 941);
});

test("students API also respects the cutoff — no student silently flips to PLACED early", async () => {
  const repo = new DemoPlacementDataRepository();
  const atCutoff = await repo.getStudents(DATA_CUTOFF);
  const afterLateBatch = await repo.getStudents("2026-08-20");

  const placedAtCutoff = atCutoff.filter((s) => s.status === "PLACED").length;
  const placedAfter = afterLateBatch.filter((s) => s.status === "PLACED").length;
  assert.equal(placedAtCutoff, 941);
  assert.equal(placedAfter, 945);
});
