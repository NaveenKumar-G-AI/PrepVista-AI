import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/errors.js";
import * as followupService from "../services/followupService.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const ownerId = typeof req.query.ownerId === "string" ? req.query.ownerId : undefined;
    const buckets = followupService.listFollowupCentre(req.db, req.auth!.institutionId, { ownerId });
    res.json({ buckets });
  })
);

const followupPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  dueAt: z.string().optional(),
  contactId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
});

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const input = followupPatchSchema.parse(req.body);
    const followup = followupService.updateFollowup(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id, input);
    res.json({ followup });
  })
);

router.post(
  "/:id/complete",
  asyncRoute(async (req, res) => {
    const followup = followupService.completeFollowup(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id);
    res.json({ followup });
  })
);

router.post(
  "/:id/cancel",
  asyncRoute(async (req, res) => {
    followupService.cancelFollowup(req.db, req.auth!.institutionId, req.auth!.userId, req.params.id);
    res.json({ ok: true });
  })
);

export default router;
