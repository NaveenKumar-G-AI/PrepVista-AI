import { Router } from "express";
import { z } from "zod";
import * as repo from "../../db/repository.js";
import { READINESS_DIMENSION_KEYS } from "../../domain/types.js";
import { MockFeature12Client } from "../../integration/featureClients.js";
import { getCurrentReadiness } from "../../engines/readinessService.js";
import { asyncHandler } from "../asyncHandler.js";

export const interventionsRouter = Router();
const feature12 = new MockFeature12Client();

interventionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const studentId = req.auth!.studentId;
    const interventions = await repo.listInterventions(studentId);
    res.json({ interventions });
  })
);

const requestSchema = z.object({ dimensionKey: z.enum(READINESS_DIMENSION_KEYS) });

/** Section 26: Feature 13 hands the gap to Feature 12 and gets back a
 * recommendation — this route IS that handoff, using the mock client. */
interventionsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = requestSchema.parse(req.body);
    const studentId = req.auth!.studentId;

    const snapshot = await getCurrentReadiness(studentId);
    if (!snapshot) {
      res.status(409).json({ error: "No readiness snapshot yet — complete a simulation first." });
      return;
    }
    const dimension = snapshot.dimensions.find((d) => d.dimensionKey === body.dimensionKey);
    if (!dimension) {
      res.status(404).json({ error: "Dimension not found in current snapshot" });
      return;
    }

    const recommendation = await feature12.recommendIntervention({
      studentId,
      gapDimensionKey: body.dimensionKey,
      evidenceSummary: dimension.evidenceSummary,
    });
    if (!recommendation) {
      res.status(404).json({ error: "No intervention available for this dimension" });
      return;
    }

    const id = await repo.createIntervention({
      studentId,
      readinessSnapshotId: snapshot.id,
      gapDimensionKey: body.dimensionKey,
      interventionType: recommendation.interventionType,
    });

    res.status(201).json({ id, ...recommendation, gapDimensionKey: body.dimensionKey, status: "recommended" });
  })
);

const completeSchema = z.object({ resultingSimulationId: z.string().uuid() });

interventionsRouter.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const body = completeSchema.parse(req.body);
    const studentId = req.auth!.studentId;
    await repo.completeIntervention(studentId, req.params.id as string, body.resultingSimulationId);
    res.status(200).json({ ok: true });
  })
);
