import { Router } from "express";
import { withStudentScope } from "../lib/db.js";
import { requireAuth } from "../middleware/auth.js";
import { getHistoryTimeline, getBeforeAfterEvidence } from "../services/masteryHistoryService.js";

export const historyRouter = Router();

historyRouter.get("/:skillId", requireAuth, async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const [timeline, beforeAfter] = await withStudentScope(req.auth!.studentId, async (client) => [
      await getHistoryTimeline(client, req.auth!.studentId, skillId),
      await getBeforeAfterEvidence(client, req.auth!.studentId, skillId),
    ]);
    res.json({ timeline, beforeAfter });
  } catch (err) {
    next(err);
  }
});
