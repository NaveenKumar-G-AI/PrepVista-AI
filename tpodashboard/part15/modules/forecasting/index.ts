/**
 * PrepVista AI — Part 15
 * Forecasting module registration.
 */

export { ForecastService, FORECAST_MODEL_VERSION } from "../../services/forecast/ForecastService.js";
export { ForecastPerformanceService } from "../../services/forecast/ForecastPerformanceService.js";
export { createForecastingTools } from "./ai-tools.js";

export const FORECASTING_MODULE_MANIFEST_FRAGMENT = {
  module: "forecasting",
  servicesExposed: ["ForecastService", "ForecastPerformanceService"],
  eventsPublished: ["FORECAST_CREATED", "FORECAST_UPDATED", "FORECAST_ERROR_DETECTED"],
  aiTools: ["get_placement_forecast", "get_offer_forecast", "get_joining_forecast", "get_department_forecast", "get_forecast_accuracy"],
};
