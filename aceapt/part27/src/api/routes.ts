import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { fixMyReadiness, runForecastPipeline } from "../services/forecastOrchestrator.js";
import { getCohortForecast } from "../services/cohortForecastService.js";
import { forecastRangeToBand, runPresetScenarios } from "../engines/scenarioEngine.js";
import { isStale } from "../repository/inMemoryForecastRepository.js";
import { requireAuth, requireRole, requireSelfOrStaff, requireStringParam } from "./middleware.js";
import { cohortMembership, deps } from "./deps.js";
import { env } from "../config/env.js";

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export const router = Router();

router.get("/healthz", (_req, res) => res.json({ ok: true }));

router.use(requireAuth);

// GET readiness — capability snapshot + current overall + status (section 60)
router.get(
  "/students/:studentId/readiness",
  requireSelfOrStaff(),
  asyncHandler(async (req, res) => {
    const pipeline = await runForecastPipeline(requireStringParam(req, "studentId"), deps);
    res.json({
      studentId: pipeline.studentId,
      currentOverall: pipeline.currentOverall,
      status: pipeline.status,
      capability: pipeline.capability,
      transition: pipeline.transition,
    });
  }),
);

// GET forecast — serves a cached snapshot when fresh (section 61), else recomputes
router.get(
  "/students/:studentId/forecast",
  requireSelfOrStaff(),
  asyncHandler(async (req, res) => {
    const studentId = requireStringParam(req, "studentId");
    const forceRecalculate = req.query.recalculate === "true";
    const cached = forceRecalculate ? null : await deps.repository.getLatestForecastSnapshot(studentId);
    if (cached && !isStale(cached, env.forecastCacheMaxAgeMs)) {
      res.json({ studentId, forecast: cached.forecast, status: cached.status, cached: true });
      return;
    }
    const pipeline = await runForecastPipeline(studentId, deps);
    res.json({ studentId, forecast: pipeline.forecast, status: pipeline.status, cached: false });
  }),
);

// GET trajectory — trend + momentum, overall and per dimension
router.get(
  "/students/:studentId/trajectory",
  requireSelfOrStaff(),
  asyncHandler(async (req, res) => {
    const pipeline = await runForecastPipeline(requireStringParam(req, "studentId"), deps);
    res.json({
      studentId: pipeline.studentId,
      overallTrend: pipeline.overallTrend,
      dimensionTrends: pipeline.dimensionTrends,
      momentum: pipeline.momentum,
    });
  }),
);

// GET risks — ranked risk signals + why panel + roadmap
router.get(
  "/students/:studentId/risks",
  requireSelfOrStaff(),
  asyncHandler(async (req, res) => {
    const pipeline = await runForecastPipeline(requireStringParam(req, "studentId"), deps);
    res.json({
      studentId: pipeline.studentId,
      risks: pipeline.risks,
      mainFactor: pipeline.mainFactor,
      whyPanel: pipeline.whyPanel,
      whyNarrative: pipeline.whyNarrative,
      roadmap: pipeline.roadmap,
    });
  }),
);

// GET forecast-history — stored snapshots over time (section 40)
router.get(
  "/students/:studentId/forecast-history",
  requireSelfOrStaff(),
  asyncHandler(async (req, res) => {
    const history = await deps.repository.getForecastHistory(requireStringParam(req, "studentId"));
    res.json({ studentId: requireStringParam(req, "studentId"), history });
  }),
);

// GET scenarios — "what if" comparisons (section 35-37)
router.get(
  "/students/:studentId/scenarios",
  requireSelfOrStaff(),
  asyncHandler(async (req, res) => {
    const studentId = requireStringParam(req, "studentId");
    const pipeline = await runForecastPipeline(studentId, deps);
    if (!pipeline.forecast || !pipeline.target) {
      res.json({ studentId, scenarios: [], note: "No target configured yet — set a target to see scenarios." });
      return;
    }
    const daysRemaining = pipeline.forecast.daysRemaining;
    const weeksRemaining = daysRemaining != null ? Math.max(daysRemaining, 0) / 7 : (deps.defaultHorizonWeeks ?? 3);
    const mid = (pipeline.forecast.projectedRange.low + pipeline.forecast.projectedRange.high) / 2;
    const scenarios = runPresetScenarios(
      {
        current: pipeline.currentOverall,
        observedSlopePerWeek: pipeline.overallTrend.slopePerWeek ?? 0,
        weeksRemaining,
        baseConfidence: pipeline.forecast.confidence.level,
        baseBand: forecastRangeToBand(pipeline.forecast.projectedRange, mid),
      },
      pipeline.mainFactor,
    );
    res.json({ studentId, scenarios });
  }),
);

// POST recalculate — force a fresh pipeline run (e.g. after new evidence)
router.post(
  "/students/:studentId/recalculate",
  requireSelfOrStaff(),
  asyncHandler(async (req, res) => {
    const pipeline = await runForecastPipeline(requireStringParam(req, "studentId"), deps);
    res.json({ studentId: pipeline.studentId, forecast: pipeline.forecast, status: pipeline.status });
  }),
);

// POST fix-my-readiness — hand the top gap to Feature 26 (section 39, 50)
router.post(
  "/students/:studentId/fix-my-readiness",
  requireSelfOrStaff(),
  asyncHandler(async (req, res) => {
    const { plan } = await fixMyReadiness(requireStringParam(req, "studentId"), deps);
    res.json({ studentId: requireStringParam(req, "studentId"), plan });
  }),
);

// GET cohort forecast — TPO/admin only (section 51-53)
router.get(
  "/cohorts/:cohortId/forecast",
  requireRole("tpo", "admin"),
  asyncHandler(async (req, res) => {
    const cohortId = requireStringParam(req, "cohortId");
    const studentIds = cohortMembership.get(cohortId) ?? [];
    const result = await getCohortForecast(cohortId, studentIds, deps);
    res.json(result);
  }),
);
