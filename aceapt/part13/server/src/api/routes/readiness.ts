import { Router } from "express";
import { explainReadiness, explainWhyNotReady } from "../../ai/explanationService.js";
import { getCurrentReadiness, getReadinessTrend, recomputeReadiness } from "../../engines/readinessService.js";
import { asyncHandler } from "../asyncHandler.js";

export const readinessRouter = Router();

readinessRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const studentId = req.auth!.studentId;
    let snapshot = await getCurrentReadiness(studentId);
    if (!snapshot) snapshot = await recomputeReadiness(studentId);
    const explanation = await explainReadiness(snapshot);
    res.json({ readiness: snapshot, explanation });
  })
);

readinessRouter.post(
  "/recompute",
  asyncHandler(async (req, res) => {
    const studentId = req.auth!.studentId;
    const snapshot = await recomputeReadiness(studentId);
    const explanation = await explainReadiness(snapshot);
    res.json({ readiness: snapshot, explanation });
  })
);

readinessRouter.get(
  "/why-not-ready",
  asyncHandler(async (req, res) => {
    const studentId = req.auth!.studentId;
    let snapshot = await getCurrentReadiness(studentId);
    if (!snapshot) snapshot = await recomputeReadiness(studentId);
    const explanation = await explainWhyNotReady(snapshot);
    res.json({ explanation });
  })
);

readinessRouter.get(
  "/trend",
  asyncHandler(async (req, res) => {
    const studentId = req.auth!.studentId;
    const trend = await getReadinessTrend(studentId);
    res.json({ trend });
  })
);
