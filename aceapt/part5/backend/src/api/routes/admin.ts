import { Router } from "express";
import { Role } from "../../domain/enums";
import { AnalyticsRepository } from "../../repositories/analyticsRepository";
import { requireAuth, requireRole } from "../middleware";

export const adminRouter = Router();

/**
 * §39 — the only institutional-visibility surface Feature 5 exposes:
 * aggregate, de-identified counts of engagement/adaptation/mastery events.
 * No student roster, no per-student drill-down, no recruiter or
 * placement-drive functionality — that is explicitly out of scope (§5).
 */
adminRouter.get("/admin/aggregate", requireAuth, requireRole(Role.TPO_ADMIN), (req, res) => {
  const since = typeof req.query.since === "string" ? req.query.since : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const counts = AnalyticsRepository.aggregateByType(since);
  res.json({ since, counts });
});
