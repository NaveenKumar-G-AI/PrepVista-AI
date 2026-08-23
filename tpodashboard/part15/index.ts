/**
 * PrepVista AI — Part 15
 * Placement Forecasting + Strategy Engine + Institutional Intelligence
 *
 * Top-level bootstrap. Wires every service/tool/handler against the DEMO
 * repository by default so this module runs out of the box (`npm run demo`,
 * `npm test`). To integrate for real, construct `bootstrap()` with your own
 * PlacementDataRepository implementation instead — nothing else in this
 * file, or in services/api/modules, needs to change.
 */

import type { PlacementDataRepository } from "./repository/PlacementDataRepository.js";
import { DemoPlacementDataRepository } from "./repository/demo/DemoPlacementDataRepository.js";
import { ForecastService } from "./services/forecast/ForecastService.js";
import { ForecastPerformanceService } from "./services/forecast/ForecastPerformanceService.js";
import { TargetService } from "./services/strategy/TargetService.js";
import { GapAnalysisService } from "./services/strategy/GapAnalysisService.js";
import { RecommendationEngine } from "./services/strategy/RecommendationEngine.js";
import { StrategicGapService } from "./services/strategy/StrategicGapService.js";
import { RoadmapService, DemoActionSystemAdapter } from "./services/strategy/RoadmapService.js";
import { ScenarioService } from "./services/scenario/ScenarioService.js";
import { OpportunityCoverageService } from "./services/opportunity-intelligence/OpportunityCoverageService.js";
import { SkillSupplyDemandService } from "./services/opportunity-intelligence/SkillSupplyDemandService.js";
import { CompanyConcentrationService } from "./services/opportunity-intelligence/CompanyConcentrationService.js";
import { OutreachPriorityService } from "./services/opportunity-intelligence/OutreachPriorityService.js";
import { createForecastingTools } from "./modules/forecasting/ai-tools.js";
import { createStrategyTools } from "./modules/strategy/ai-tools.js";
import { createScenarioTools } from "./modules/scenarios/index.js";
import { createForecastApiHandlers } from "./api/forecast/router.js";
import { createStrategyApiHandlers } from "./api/strategy/router.js";
import { strategyEventBus } from "./events/event-bus.js";
import { auditLog } from "./audit/audit-log.js";

export function bootstrap(repo: PlacementDataRepository = new DemoPlacementDataRepository()) {
  const performance = new ForecastPerformanceService();
  const actionAdapter = new DemoActionSystemAdapter();

  const services = {
    forecast: new ForecastService(repo, performance),
    forecastPerformance: performance,
    target: new TargetService(repo),
    gapAnalysis: new GapAnalysisService(repo),
    recommendations: new RecommendationEngine(repo),
    strategicGaps: new StrategicGapService(repo),
    roadmap: new RoadmapService(repo, actionAdapter),
    scenario: new ScenarioService(repo),
    opportunityCoverage: new OpportunityCoverageService(repo),
    skillSupplyDemand: new SkillSupplyDemandService(repo),
    companyConcentration: new CompanyConcentrationService(repo),
    outreachPriority: new OutreachPriorityService(repo),
  };

  const aiTools = [...createForecastingTools(repo, performance), ...createStrategyTools(repo, actionAdapter), ...createScenarioTools(repo)];

  const api = {
    forecast: createForecastApiHandlers(repo, performance),
    strategy: createStrategyApiHandlers(repo, actionAdapter),
  };

  return { repo, services, aiTools, api, events: strategyEventBus, audit: auditLog, actionAdapter };
}

export type Bootstrap = ReturnType<typeof bootstrap>;

// Re-export the pieces most integrations will want directly.
export type { PlacementDataRepository } from "./repository/PlacementDataRepository.js";
export * from "./types/placement-strategy.types.js";
