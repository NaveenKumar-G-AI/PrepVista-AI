import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../middleware/authorize";
import { validateRequest } from "../middleware/inputValidation";
import { resolveOrgScope } from "../middleware/tenantIsolation";
import { asyncRoute } from "../middleware/errorHandler";
import { searchAuditEvents, getAuditEventById } from "../audit/audit.service";
import { EVENT_RESULTS } from "../types/events";

const router = Router();

const searchQuerySchema = z.object({
  actorUserId: z.string().uuid().optional(),
  action: z.string().max(200).optional(),
  resourceType: z.string().max(100).optional(),
  resourceId: z.string().max(200).optional(),
  result: z.enum(EVENT_RESULTS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

/**
 * AUDIT CENTER
 * -----------------------------------------------------------------------
 * Note the permission granularity here matches AUDIT ACCESS CONTROL from
 * the brief: this route requires audit:read:organization, which STUDENT
 * and TRAINER roles do not hold (see types/identity.ts) — "own relevant
 * activity" for a student is expected to be exposed via CodeForge's
 * existing per-feature endpoints (e.g. "my submission history"), not by
 * loosening this platform-wide audit search to every role.
 */
router.get(
  "/events",
  requirePermission("audit:read:organization"),
  validateRequest({ query: searchQuerySchema }),
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const q = req.query as unknown as z.infer<typeof searchQuerySchema>;
    const organizationId = resolveOrgScope(req);

    const events = await searchAuditEvents(identity, { organizationId, ...q });
    res.json({ events, limit: q.limit, offset: q.offset });
  })
);

router.get(
  "/events/:id",
  requirePermission("audit:read:organization"),
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const event = await getAuditEventById(identity, req.params.id!);
    if (!event) return res.status(404).json({ error: "not_found" });
    res.json({ event });
  })
);

export default router;
