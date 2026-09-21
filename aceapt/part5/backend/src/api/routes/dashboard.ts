import { Router } from "express";
import { PracticeOrchestrator } from "../../services/practiceOrchestrator";
import { requireAuth } from "../middleware";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", requireAuth, async (req, res, next) => {
  try {
    const data = await PracticeOrchestrator.getDashboard(req.user!.studentId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/students/:studentId/mastery", requireAuth, async (req, res, next) => {
  try {
    if (req.params.studentId !== req.user!.studentId) {
      return res.status(403).json({ error: "Cannot view another student's mastery record." });
    }
    const overview = await PracticeOrchestrator.getMasteryOverview(req.user!.studentId);
    res.json(overview);
  } catch (err) {
    next(err);
  }
});
