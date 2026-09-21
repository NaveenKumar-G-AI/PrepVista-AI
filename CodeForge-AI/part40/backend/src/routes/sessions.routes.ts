import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler";
import { listOwnSessions, revokeSession, SessionAccessDeniedError } from "../security/session.service";

const router = Router();

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const sessions = await listOwnSessions(identity);
    res.json({ sessions });
  })
);

const revokeSchema = z.object({ reason: z.string().max(500).default("user_initiated") });
const paramsSchema = z.object({ id: z.string().uuid() });

router.post(
  "/:id/revoke",
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const params = paramsSchema.parse(req.params);
    const body = revokeSchema.parse(req.body ?? {});

    try {
      const updated = await revokeSession(identity, params.id, body.reason, req.correlationId);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json({ session: updated });
    } catch (err) {
      if (err instanceof SessionAccessDeniedError) {
        return res.status(403).json({ error: "forbidden", message: err.message });
      }
      throw err;
    }
  })
);

export default router;
