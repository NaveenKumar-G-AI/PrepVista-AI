import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoPlacementDataRepository } from "../../repository/demo/DemoPlacementDataRepository.js";
import { ScenarioService } from "../../services/scenario/ScenarioService.js";
import { DATA_CUTOFF } from "../../repository/demo/seed.js";

test("running a scenario never changes what the repository returns afterward", async () => {
  const repo = new DemoPlacementDataRepository();
  const before = await repo.getCurrentSeasonSnapshot(DATA_CUTOFF);
  const beforeCopy = JSON.parse(JSON.stringify(before));

  const scenarioService = new ScenarioService(repo);
  await scenarioService.runScenario(DATA_CUTOFF, {
    label: "Aggressive improvement",
    applicationConversionDelta: 10,
    interviewConversionDelta: 8,
    offerAcceptanceDelta: 5,
    joiningConversionDelta: 5,
    additionalDrives: 10,
  });

  const after = await repo.getCurrentSeasonSnapshot(DATA_CUTOFF);
  assert.deepEqual(after, beforeCopy, "repository state must be byte-for-byte identical after a scenario run");
});

test("PlacementDataRepository has no write/mutation methods — isolation is structural, not just conventional", async () => {
  const repo = new DemoPlacementDataRepository();
  const writeLikeNames = Object.getOwnPropertyNames(Object.getPrototypeOf(repo)).filter((name) =>
    /^(set|update|write|save|delete|create|mutate|patch)/i.test(name)
  );
  assert.deepEqual(writeLikeNames, [], `repository exposes what look like write methods: ${writeLikeNames.join(", ")}`);
});

test("a scenario result is always labeled 'scenario_estimate' and carries a non-empty caveat, never presented as a guarantee", async () => {
  const repo = new DemoPlacementDataRepository();
  const result = await new ScenarioService(repo).runScenario(DATA_CUTOFF, { label: "Modest improvement", joiningConversionDelta: 3 });

  assert.equal(result.type, "scenario_estimate");
  assert.ok(result.caveat.length > 0);
  assert.match(result.caveat, /[Ss]cenario estimate/);
});

test("scenario uncertainty is at least as wide as the baseline forecast's uncertainty", async () => {
  const repo = new DemoPlacementDataRepository();
  const scenarioService = new ScenarioService(repo);
  const comparison = await scenarioService.compareScenarios(DATA_CUTOFF, [{ label: "Small joining improvement", joiningConversionDelta: 2 }]);

  const baselineWidth = comparison.current.range.high - comparison.current.range.low;
  const scenario = comparison.scenarios[0]!;
  const scenarioWidth = scenario.projectedRange.high - scenario.projectedRange.low;
  assert.ok(scenarioWidth >= baselineWidth, `scenario width ${scenarioWidth} should be >= baseline width ${baselineWidth}`);
});

test("a scenario with all deltas at zero produces a result close to (not necessarily identical to) the baseline forecast", async () => {
  const repo = new DemoPlacementDataRepository();
  const scenarioService = new ScenarioService(repo);
  const comparison = await scenarioService.compareScenarios(DATA_CUTOFF, [{ label: "No change" }]);
  const scenario = comparison.scenarios[0]!;
  assert.ok(Math.abs(scenario.baselinePointEstimate - comparison.current.pointEstimate) < 0.01);
});
