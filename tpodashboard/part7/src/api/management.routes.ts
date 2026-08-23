import { Router } from "express";
import { z } from "zod";
import * as overview from "../services/overviewService";
import * as readiness from "../services/readinessService";
import * as effectiveness from "../services/effectivenessService";
import { requireCapability } from "./middleware/auth";
import { asyncHandler, param } from "./middleware/common";

/**
 * Every route here is intentionally aggregate-only — none accept a bare
 * studentId (spec §66/§81: management answers institution/department-level
 * questions without needing operational student-level detail).
 */
export const managementRouter = Router();
managementRouter.use(requireCapability("VIEW_AGGREGATE_ANALYTICS"));

managementRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const seasonId = z.string().parse(req.query.seasonId);
    res.json(await overview.getInstitutionOverview(req.actor!.institutionId, seasonId));
  })
);

managementRouter.get(
  "/department-readiness",
  asyncHandler(async (req, res) => {
    const { seasonId, department } = z.object({ seasonId: z.string(), department: z.string() }).parse(req.query);
    res.json(await readiness.getDepartmentReadiness(req.actor!.institutionId, seasonId, department));
  })
);

managementRouter.get(
  "/training/:id/effectiveness",
  asyncHandler(async (req, res) => {
    res.json(await effectiveness.getTrainingEffectiveness(param(req, "id")));
  })
);

managementRouter.get(
  "/interventions/:id/effectiveness",
  asyncHandler(async (req, res) => {
    res.json(await effectiveness.getInterventionEffectiveness(param(req, "id")));
  })
);
