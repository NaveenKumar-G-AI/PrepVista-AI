import { Router } from "express";
import { getCapabilityState } from "../engine/orchestrator";
import { asyncHandler } from "../middleware/errorHandler";

export const capabilityStateRouter = Router();

// GET /api/capability-state - section 42
capabilityStateRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { states, diagnoses } = getCapabilityState(req.studentId);
    res.json({ topics: states, diagnoses });
  })
);
