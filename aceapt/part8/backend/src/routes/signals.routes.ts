import { Router } from "express";
import { withServiceScope } from "../lib/db.js";
import { requireAuth } from "../middleware/auth.js";
import { listRecentForStudent } from "../repositories/signalOutboxRepository.js";

export const signalsRouter = Router();

/**
 * Demo/debug visibility into "what would Feature 7/4/3/6 have received
 * about me" (spec section 32's outbound signals). signal_outbox has no RLS
 * of its own (it's a service-owned integration table, not a student-scoped
 * one - see sql/schema.sql), so this route enforces the student boundary
 * itself via the query filter rather than relying on RLS here.
 */
signalsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const signals = await withServiceScope((client) => listRecentForStudent(client, req.auth!.studentId, 30));
    res.json({ signals });
  } catch (err) {
    next(err);
  }
});
