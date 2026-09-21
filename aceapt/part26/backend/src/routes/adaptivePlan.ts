import { Router } from "express";
import { getAdaptivePlan } from "../engine/orchestrator";
import { asyncHandler } from "../middleware/errorHandler";

export const adaptivePlanRouter = Router();

// GET /api/adaptive-plan?minutes=15&reset=true - section 42
adaptivePlanRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const minutes = parseInt((req.query.minutes as string) || "15", 10);
    const reset = req.query.reset === "true";
    if (!Number.isFinite(minutes) || minutes <= 0) {
      res.status(400).json({ error: "minutes must be a positive number" });
      return;
    }
    const result = await getAdaptivePlan(req.studentId, minutes, reset);
    res.json(result);
  })
);
