import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../middleware/authorize";
import { requireRecentAuth } from "../middleware/requireRecentAuth";
import { validateRequest } from "../middleware/inputValidation";
import { asyncRoute } from "../middleware/errorHandler";
import {
  listIncidents,
  getIncidentWithTimeline,
  createIncident,
  transitionIncident,
  recordPostmortem,
  InvalidTransitionError
} from "../incidents/incident.service";
import { recordAuditEvent } from "../audit/audit.service";
import { INCIDENT_STATUSES, ALERT_SEVERITIES } from "../types/events";

const router = Router();

const listQuerySchema = z.object({
  status: z.enum(INCIDENT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

router.get(
  "/",
  requirePermission("incidents:read:organization"),
  validateRequest({ query: listQuerySchema }),
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const incidents = await listIncidents(identity, q);
    res.json({ incidents, limit: q.limit, offset: q.offset });
  })
);

router.get(
  "/:id",
  requirePermission("incidents:read:organization"),
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const incident = await getIncidentWithTimeline(identity, req.params.id!);
    if (!incident) return res.status(404).json({ error: "not_found" });
    res.json({ incident });
  })
);

const createSchema = z.object({
  title: z.string().min(3).max(300),
  severity: z.enum(ALERT_SEVERITIES),
  organizationId: z.string().uuid().nullable(),
  affectedServices: z.array(z.string().max(100)).max(20).default([]),
  detectionNote: z.string().min(3).max(2000)
});

/**
 * Manual incident creation — for reliability events that never produced a
 * security alert (e.g. an operator notices a database outage directly).
 * Requires PLATFORM_OPERATOR (incidents:manage:platform) since opening an
 * incident on behalf of another organization is inherently a
 * cross-tenant action.
 */
router.post(
  "/",
  requirePermission("incidents:manage:platform"),
  validateRequest({ body: createSchema }),
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const body = req.body as z.infer<typeof createSchema>;

    const incident = await createIncident({ ...body, actorUserId: identity.userId });

    await recordAuditEvent({
      actorUserId: identity.userId,
      actorRole: identity.role,
      organizationId: body.organizationId,
      action: "incident.create",
      eventType: "ADMIN_ACTION",
      resourceType: "incident",
      resourceId: incident.id,
      result: "SUCCESS",
      afterState: { title: body.title, severity: body.severity, status: "OPEN" },
      correlationId: req.correlationId
    });

    res.status(201).json({ incident });
  })
);

const transitionSchema = z.object({
  status: z.enum(INCIDENT_STATUSES),
  note: z.string().min(3).max(2000)
});

router.patch(
  "/:id/status",
  requirePermission("incidents:read:organization"),
  requireRecentAuth,
  validateRequest({ params: z.object({ id: z.string().uuid() }), body: transitionSchema }),
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const body = req.body as z.infer<typeof transitionSchema>;

    let updated;
    try {
      updated = await transitionIncident(identity, req.params.id!, body.status, body.note);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return res.status(409).json({ error: "invalid_transition", message: err.message });
      }
      throw err;
    }

    if (!updated) return res.status(404).json({ error: "not_found" });

    await recordAuditEvent({
      actorUserId: identity.userId,
      actorRole: identity.role,
      organizationId: updated.organization_id,
      action: "incident.transition",
      eventType: "ADMIN_ACTION",
      resourceType: "incident",
      resourceId: updated.id,
      result: "SUCCESS",
      afterState: { status: body.status },
      metadata: { note: body.note },
      correlationId: req.correlationId
    });

    res.json({ incident: updated });
  })
);

const postmortemSchema = z.object({
  impact: z.string().min(1).max(4000),
  rootCause: z.string().min(1).max(4000),
  detection: z.string().min(1).max(4000),
  mitigation: z.string().min(1).max(4000),
  recovery: z.string().min(1).max(4000),
  correctiveActions: z.string().min(1).max(4000)
});

router.put(
  "/:id/postmortem",
  requirePermission("incidents:manage:platform"),
  requireRecentAuth,
  validateRequest({ params: z.object({ id: z.string().uuid() }), body: postmortemSchema }),
  asyncRoute(async (req, res) => {
    const identity = req.identity!;
    const body = req.body as z.infer<typeof postmortemSchema>;

    const updated = await recordPostmortem(identity, req.params.id!, body);
    if (!updated) return res.status(404).json({ error: "not_found" });

    await recordAuditEvent({
      actorUserId: identity.userId,
      actorRole: identity.role,
      organizationId: updated.organization_id,
      action: "incident.postmortem_recorded",
      eventType: "ADMIN_ACTION",
      resourceType: "incident",
      resourceId: updated.id,
      result: "SUCCESS",
      correlationId: req.correlationId
    });

    res.json({ incident: updated });
  })
);

export default router;
