import { Router } from "express";
import { getNextAction } from "../engine/orchestrator";
import { asyncHandler } from "../middleware/errorHandler";

export const nextActionRouter = Router();

// GET /api/next-action - section 42, the primary "what should I do now" read
nextActionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await getNextAction(req.studentId);
    res.json(result);
  })
);
