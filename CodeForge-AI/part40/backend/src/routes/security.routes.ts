import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../middleware/authorize";
import { validateRequest } from "../middleware/inputValidation";
import { resolveOrgScope } from "../middleware/tenantIsolation";
import { asyncRoute } from "../middleware/errorHandler";
import { searchSecurityEvents } from "../security/securityEvents.service";
import { runInTenantContext } from "../db/tenantContext";
import { withAudit } from "../middleware/auditMiddleware";
import { SECURITY_EVENT_TYPES, EVENT_RESULTS, ALERT_STATUSES } from "../types/events";

const router = Router();

const searchQuerySchema = z.object({
  eventType: z.enum(SECURITY_EVENT_TYPES).optional(),
  actorUserId: z.string().uuid().optional(),
  result: z.enum(EVENT_RESULTS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

/**
 * AUDIT CENTER-equivalent for security events. Requires
 * security_events:read:organization (ADMIN+) or :platform (operator).
 * Actual row visibility is still bounded by RLS regardless of what this
 * permission check allows — see searchSecurityEvents -> runInTenantContext.
 */
router.get(
  "/events",
  requirePermission("security_events:read:organization"),
  validateRequest({ query: searchQuerySchema }),
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const q = req.query as unknown as z.infer<typeof searchQuerySchema>;
    const organizationId = resolveOrgScope(req);

    const events = await searchSecurityEvents(identity, { organizationId, ...q });
    res.json({ events, limit: q.limit, offset: q.offset });
  })
);

const alertListQuerySchema = z.object({
  status: z.enum(ALERT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

router.get(
  "/alerts",
  requirePermission("security_events:read:organization"),
  validateRequest({ query: alertListQuerySchema }),
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const q = req.query as unknown as z.infer<typeof alertListQuerySchema>;
    const organizationId = resolveOrgScope(req);

    const alerts = await runInTenantContext(identity, async (client) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (organizationId) {
        params.push(organizationId);
        conditions.push(`organization_id = $${params.length}`);
      }
      if (q.status) {
        params.push(q.status);
        conditions.push(`status = $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(q.limit, q.offset);
      const { rows } = await client.query(
        `SELECT * FROM security_alert ${where} ORDER BY last_seen_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return rows;
    });

    res.json({ alerts, limit: q.limit, offset: q.offset });
  })
);

const alertIdParamSchema = z.object({ id: z.string().uuid() });

/**
 * These two routes use the declarative withAudit() wrapper (see
 * middleware/auditMiddleware.ts) rather than calling recordAuditEvent()
 * inline — a demonstration of the "fast path" for routes that fit the
 * common before/after-mutation shape. incidents.routes.ts uses the direct
 * call style instead, where the audit detail needs more explicit control
 * (e.g. distinguishing which transition happened). Both call the exact
 * same underlying audit.service.ts — this is a routing convenience, not two audit systems.
 */
router.patch(
  "/alerts/:id/acknowledge",
  requirePermission("security_events:read:organization"),
  validateRequest({ params: alertIdParamSchema }),
  withAudit({ action: "security_alert.acknowledge", eventType: "ADMIN_ACTION", resourceType: "security_alert" })(
    async (req, res) => {
      const identity = req.identity!;
      const updated = await runInTenantContext(identity, async (client) => {
        const { rows } = await client.query(
          `UPDATE security_alert SET status = 'ACKNOWLEDGED', acknowledged_by_user_id = $1, acknowledged_at = now()
           WHERE id = $2 AND status = 'OPEN' RETURNING *`,
          [identity.userId, req.params.id]
        );
        return rows[0] ?? null;
      });

      if (!updated) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.locals.resourceId = updated.id;
      res.locals.afterState = { status: "ACKNOWLEDGED" };
      res.json({ alert: updated });
    }
  )
);

router.patch(
  "/alerts/:id/resolve",
  requirePermission("security_events:read:organization"),
  validateRequest({ params: alertIdParamSchema }),
  withAudit({ action: "security_alert.resolve", eventType: "ADMIN_ACTION", resourceType: "security_alert" })(async (req, res) => {
    const identity = req.identity!;
    const updated = await runInTenantContext(identity, async (client) => {
      const { rows } = await client.query(
        `UPDATE security_alert SET status = 'RESOLVED', resolved_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      return rows[0] ?? null;
    });

    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.locals.resourceId = updated.id;
    res.locals.afterState = { status: "RESOLVED" };
    res.json({ alert: updated });
  })
);

export default router;
