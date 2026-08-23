/**
 * PrepVista AI — Part 15
 * Strategy module registration.
 */

export { TargetService } from "../../services/strategy/TargetService.js";
export { GapAnalysisService, BENCHMARK_EVENTUAL_JOIN_RATE } from "../../services/strategy/GapAnalysisService.js";
export { RecommendationEngine } from "../../services/strategy/RecommendationEngine.js";
export { StrategicGapService } from "../../services/strategy/StrategicGapService.js";
export { RoadmapService, DemoActionSystemAdapter } from "../../services/strategy/RoadmapService.js";
export { OpportunityCoverageService } from "../../services/opportunity-intelligence/OpportunityCoverageService.js";
export { SkillSupplyDemandService } from "../../services/opportunity-intelligence/SkillSupplyDemandService.js";
export { CompanyConcentrationService } from "../../services/opportunity-intelligence/CompanyConcentrationService.js";
export { OutreachPriorityService } from "../../services/opportunity-intelligence/OutreachPriorityService.js";
export { createStrategyTools } from "./ai-tools.js";

export const STRATEGY_MODULE_MANIFEST_FRAGMENT = {
  module: "strategy",
  servicesExposed: [
    "TargetService",
    "GapAnalysisService",
    "RecommendationEngine",
    "StrategicGapService",
    "RoadmapService",
    "OpportunityCoverageService",
    "SkillSupplyDemandService",
    "CompanyConcentrationService",
    "OutreachPriorityService",
  ],
  eventsPublished: [
    "TARGET_GAP_DETECTED",
    "STRATEGIC_GAP_DETECTED",
    "STRATEGIC_RECOMMENDATION_CREATED",
    "STRATEGIC_ACTION_CREATED",
    "STRATEGIC_ACTION_COMPLETED",
    "OPPORTUNITY_COVERAGE_UPDATED",
    "COMPANY_CONCENTRATION_UPDATED",
  ],
  aiTools: [
    "get_target_gap",
    "get_strategic_gaps",
    "get_strategic_recommendations",
    "get_strategy_actions",
    "get_opportunity_coverage",
    "get_skill_demand",
    "get_skill_supply",
    "get_company_concentration",
    "get_industry_concentration",
    "get_strategy_roadmap",
    "get_personal_outlook",
  ],
};
