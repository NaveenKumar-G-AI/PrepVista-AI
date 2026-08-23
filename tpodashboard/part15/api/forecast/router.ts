/**
 * PrepVista AI — Part 15
 *
 * Framework-agnostic API handlers. Parts 1-14 might run Express, Fastify,
 * NestJS, or Next.js API routes — rather than guess, these handlers take a
 * minimal typed request and return a typed result; wire them into whatever
 * framework you already have with a thin adapter (Express example at the
 * bottom of this file, ~15 lines).
 */

import type { CallerContext } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { ForecastService } from "../../services/forecast/ForecastService.js";
import { ForecastPerformanceService } from "../../services/forecast/ForecastPerformanceService.js";
import { AuthorizationError, assertInstitutionalAccess } from "../../rbac/access-control.js";

export interface ApiRequest {
  caller: CallerContext;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
}

function handleError(err: unknown): ApiResult {
  if (err instanceof AuthorizationError) return { status: 403, body: { error: err.message } };
  return { status: 500, body: { error: err instanceof Error ? err.message : "Unknown error" } };
}

export function createForecastApiHandlers(repo: PlacementDataRepository, performance: ForecastPerformanceService) {
  const forecastService = new ForecastService(repo, performance);

  return {
    // GET /api/forecast/placement?asOf=2026-08-13
    getPlacementForecast: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf query param is required" } };
        const forecast = await forecastService.getPlacementForecast(asOf);
        performance.recordForecast("PLACEMENT_PCT", "INSTITUTION", forecast);
        return { status: 200, body: forecast };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/forecast/offers?asOf=...
    getOfferForecast: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf query param is required" } };
        return { status: 200, body: await forecastService.getOfferForecast(asOf) };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/forecast/departments/:departmentId?asOf=...
    getDepartmentForecast: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        const departmentId = req.params.departmentId;
        if (!asOf || !departmentId) return { status: 400, body: { error: "asOf query param and departmentId path param are required" } };
        return { status: 200, body: await forecastService.getDepartmentForecast(departmentId, asOf) };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/forecast/accuracy?asOf=...
    getForecastAccuracy: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf query param is required" } };
        const { components } = await forecastService.computeInstitutionForecastComponents(asOf);
        return {
          status: 200,
          body: {
            backtestedHistoricalMAE: Number.isNaN(components.backtestMAE) ? null : components.backtestMAE,
            historicalSeasonsUsed: components.historicalSeasonCount,
            liveTrackedAccuracy: performance.getAccuracySummary(),
          },
        };
      } catch (err) {
        return handleError(err);
      }
    },
  };
}

/**
 * Express adapter example — delete this if you use a different framework.
 * Assumes upstream auth middleware has already populated `req.caller`
 * (role/userId/institutionId/studentId) from the authenticated session.
 *
 * import express from "express";
 * const router = express.Router();
 * const handlers = createForecastApiHandlers(repo, performance);
 * router.get("/placement", async (req, res) => {
 *   const result = await handlers.getPlacementForecast({ caller: req.caller, params: req.params, query: req.query as Record<string, string> });
 *   res.status(result.status).json(result.body);
 * });
 */
