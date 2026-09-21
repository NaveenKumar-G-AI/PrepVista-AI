import { Router } from "express";
import { withStudentScope } from "../lib/db.js";
import { requireAuth } from "../middleware/auth.js";
import { listReviewQueue, markReviewEntryStatus } from "../repositories/reviewScheduleRepository.js";
import { getMasteryModelConfig } from "../config/masteryModel.js";
import { findSkillById } from "../repositories/skillRepository.js";

export const reviewRouter = Router();

/** Spec section 41: "the queue should remain manageable" - capped by config,
 *  not by however many happen to be due. */
reviewRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const config = getMasteryModelConfig();
    const queue = await withStudentScope(req.auth!.studentId, async (client) => {
      const items = await listReviewQueue(client, req.auth!.studentId, config.review.maxQueueSizePerStudent);
      const withSkillNames = [];
      for (const item of items) {
        withSkillNames.push({ ...item, skill: await findSkillById(client, item.skillId) });
      }
      return withSkillNames;
    });
    res.json({ queue });
  } catch (err) {
    next(err);
  }
});

reviewRouter.post("/:skillId/skip", requireAuth, async (req, res, next) => {
  try {
    const { skillId } = req.params;
    await withStudentScope(req.auth!.studentId, (client) => markReviewEntryStatus(client, req.auth!.studentId, skillId, "SKIPPED"));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
