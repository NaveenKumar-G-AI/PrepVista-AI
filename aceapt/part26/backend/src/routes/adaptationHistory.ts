import { Router } from "express";
import { getHistory } from "../engine/orchestrator";
import { asyncHandler } from "../middleware/errorHandler";

export const adaptationHistoryRouter = Router();

// GET /api/adaptation-history - section 36/42
adaptationHistoryRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ events: getHistory(req.studentId) });
  })
);
