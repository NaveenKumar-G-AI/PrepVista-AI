/**
 * PrepVista AI — Part 15 → Part 12 integration surface.
 * Forecasting tools. Part 12 narrates; Part 15 calculates (Section 81).
 * Every handler asserts TPO/MANAGEMENT access before touching the repository
 * and returns the ForecastService output UNMODIFIED — see the ToolDefinition
 * doc comment in types/placement-strategy.types.ts for why that matters.
 */

import type { CallerContext, ToolDefinition } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { ForecastService } from "../../services/forecast/ForecastService.js";
import { ForecastPerformanceService } from "../../services/forecast/ForecastPerformanceService.js";
import { assertInstitutionalAccess } from "../../rbac/access-control.js";

export function createForecastingTools(repo: PlacementDataRepository, performance: ForecastPerformanceService): ToolDefinition[] {
  const forecastService = new ForecastService(repo, performance);

  const withAuth = (caller: CallerContext) => assertInstitutionalAccess(caller);

  return [
    {
      name: "get_placement_forecast",
      description: "Projected final verified-placement percentage for the current season, with range, confidence, and known limitations. Never a bare number.",
      parameters: { type: "object", properties: { asOf: { type: "string", description: "ISO date cutoff" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string }, caller) => {
        withAuth(caller);
        const forecast = await forecastService.getPlacementForecast(args.asOf);
        performance.recordForecast("PLACEMENT_PCT", "INSTITUTION", forecast);
        return forecast;
      },
    },
    {
      name: "get_offer_forecast",
      description: "Projected final percentage of students who will have received at least one offer by season end.",
      parameters: { type: "object", properties: { asOf: { type: "string" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string }, caller) => {
        withAuth(caller);
        return forecastService.getOfferForecast(args.asOf);
      },
    },
    {
      name: "get_joining_forecast",
      description: "Projected final verified-joining percentage. In this system joining IS the verified-placement event, so this returns the same computation as get_placement_forecast — exposed separately because it's asked about separately.",
      parameters: { type: "object", properties: { asOf: { type: "string" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string }, caller) => {
        withAuth(caller);
        return forecastService.getJoiningForecast(args.asOf);
      },
    },
    {
      name: "get_department_forecast",
      description: "Department-level forecast. Returns dataAvailable:false with a reason (never a fabricated number) when the department's sample size is below the reliability threshold.",
      parameters: { type: "object", properties: { departmentId: { type: "string" }, asOf: { type: "string" } }, required: ["departmentId", "asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { departmentId: string; asOf: string }, caller) => {
        withAuth(caller);
        return forecastService.getDepartmentForecast(args.departmentId, args.asOf);
      },
    },
    {
      name: "get_forecast_accuracy",
      description: "Forecast performance/monitoring: backtested historical error of the baseline method, plus live forecast-vs-actual accuracy once outcomes have been recorded.",
      parameters: { type: "object", properties: { asOf: { type: "string" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string }, caller) => {
        withAuth(caller);
        const { components } = await forecastService.computeInstitutionForecastComponents(args.asOf);
        return {
          backtestedHistoricalMAE: Number.isNaN(components.backtestMAE) ? null : components.backtestMAE,
          historicalSeasonsUsed: components.historicalSeasonCount,
          liveTrackedAccuracy: performance.getAccuracySummary(),
        };
      },
    },
  ];
}
