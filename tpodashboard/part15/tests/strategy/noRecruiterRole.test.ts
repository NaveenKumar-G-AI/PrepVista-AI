import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../../types/placement-strategy.types.js";
import { DemoPlacementDataRepository } from "../../repository/demo/DemoPlacementDataRepository.js";
import { ForecastPerformanceService } from "../../services/forecast/ForecastPerformanceService.js";
import { createForecastingTools } from "../../modules/forecasting/ai-tools.js";
import { createStrategyTools } from "../../modules/strategy/ai-tools.js";
import { createScenarioTools } from "../../modules/scenarios/index.js";
import { createForecastApiHandlers } from "../../api/forecast/router.js";
import { createStrategyApiHandlers } from "../../api/strategy/router.js";

// Section 1 / 6: "NO PREPVISTA ACCESS" for recruiters — no recruiter login,
// dashboard, forecast, AI, or portal. These checks assert the invariant
// directly against the actual exported surface, so a future edit that
// reintroduces a recruiter role/route can't do so silently.

test("the Role enum contains exactly TPO, MANAGEMENT, STUDENT — nothing else", () => {
  assert.deepEqual([...ROLES].sort(), ["MANAGEMENT", "STUDENT", "TPO"]);
  assert.equal((ROLES as readonly string[]).some((r) => /recruit/i.test(r)), false);
});

test("no AI tool name or description across forecasting/strategy/scenarios mentions recruiter access", async () => {
  const repo = new DemoPlacementDataRepository();
  const performance = new ForecastPerformanceService();
  const tools = [...createForecastingTools(repo, performance), ...createStrategyTools(repo), ...createScenarioTools(repo)];

  assert.ok(tools.length > 0);
  for (const tool of tools) {
    assert.equal(/recruiter/i.test(tool.name), false, `tool name '${tool.name}' must not reference recruiters`);
    assert.equal(
      /recruiter (login|dashboard|portal|access|self-service)/i.test(tool.description),
      false,
      `tool '${tool.name}' description must not describe recruiter-facing access`
    );
    // Company/outreach intelligence is TPO/MANAGEMENT only — never STUDENT, never a bare "anyone".
    if (tool.name === "get_company_concentration" || tool.name === "get_industry_concentration") {
      assert.deepEqual([...tool.requiresRole].sort(), ["MANAGEMENT", "TPO"]);
    }
  }
});

test("no exported API handler is named or routed for recruiters", async () => {
  const repo = new DemoPlacementDataRepository();
  const performance = new ForecastPerformanceService();
  const forecastHandlers = createForecastApiHandlers(repo, performance);
  const strategyHandlers = createStrategyApiHandlers(repo);

  const allHandlerNames = [...Object.keys(forecastHandlers), ...Object.keys(strategyHandlers)];
  assert.ok(allHandlerNames.length > 0);
  for (const name of allHandlerNames) {
    assert.equal(/recruiter/i.test(name), false, `handler '${name}' must not be a recruiter-facing endpoint`);
  }
});
