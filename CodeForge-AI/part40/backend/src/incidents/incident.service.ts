import { runAsSystem, runInTenantContext } from "../db/tenantContext";
import type { IncidentStatus, IncidentTimelinePhase, AlertSeverity } from "../types/events";
import type { Role } from "../types/identity";

/**
 * INCIDENT MANAGEMENT + INCIDENT TIMELINE + INCIDENT POSTMORTEM
 * -----------------------------------------------------------------------
 * OPEN -> INVESTIGATING -> MITIGATING -> MONITORING -> RESOLVED
 *
 * Every transition appends a timeline entry — the timeline is the
 * authoritative "what happened when" record for an incident, not a
 * derived view. openIncidentFromAlert() is the automatic path
 * (CRITICAL alert -> incident); createIncident() is the manual path (an
 * operator opens one directly, e.g. for a reliability event that never
 * produced a security alert, such as a database outage).
 */

const ALLOWED_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: ["INVESTIGATING", "RESOLVED"],
  INVESTIGATING: ["MITIGATING", "MONITORING", "RESOLVED"],
  MITIGATING: ["MONITORING", "RESOLVED"],
  MONITORING: ["RESOLVED", "INVESTIGATING"], // regression during monitoring goes back to investigating
  RESOLVED: []
};

export class InvalidTransitionError extends Error {
  constructor(from: IncidentStatus, to: IncidentStatus) {
    super(`Cannot transition incident from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

interface RawAlertRow {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  organization_id: string | null;
}

export async function openIncidentFromAlert(alert: RawAlertRow) {
  return runAsSystem(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO incident (title, severity, status, organization_id, affected_services, opened_by_alert_id)
       VALUES ($1,$2,'OPEN',$3,'{}',$4)
       RETURNING *`,
      [alert.title, alert.severity, alert.organization_id, alert.id]
    );
    const incident = rows[0];

    await client.query(
      `INSERT INTO incident_timeline_event (incident_id, organization_id, phase, description, actor_user_id)
       VALUES ($1,$2,'DETECTION',$3,NULL), ($1,$2,'ALERT',$4,NULL)`,
      [incident.id, alert.organization_id, `Detected via security event correlation.`, `Alert "${alert.title}" escalated automatically (severity ${alert.severity}).`]
    );

    await client.query(`UPDATE security_alert SET incident_id = $1 WHERE id = $2`, [incident.id, alert.id]);

    return incident;
  });
}

export async function createIncident(input: {
  title: string;
  severity: AlertSeverity;
  organizationId: string | null;
  affectedServices: string[];
  actorUserId: string;
  detectionNote: string;
}) {
  return runAsSystem(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO incident (title, severity, status, organization_id, affected_services)
       VALUES ($1,$2,'OPEN',$3,$4) RETURNING *`,
      [input.title, input.severity, input.organizationId, input.affectedServices]
    );
    const incident = rows[0];
    await client.query(
      `INSERT INTO incident_timeline_event (incident_id, organization_id, phase, description, actor_user_id)
       VALUES ($1,$2,'DETECTION',$3,$4)`,
      [incident.id, input.organizationId, input.detectionNote, input.actorUserId]
    );
    return incident;
  });
}

export async function transitionIncident(
  callerIdentity: { organizationId: string | null; role: Role; userId: string },
  incidentId: string,
  toStatus: IncidentStatus,
  note: string
) {
  return runInTenantContext(callerIdentity, async (client) => {
    const { rows } = await client.query(`SELECT * FROM incident WHERE id = $1`, [incidentId]);
    const incident = rows[0];
    if (!incident) return null; // RLS already hid cross-org incidents; this covers "doesn't exist at all"

    const from = incident.status as IncidentStatus;
    if (!ALLOWED_TRANSITIONS[from].includes(toStatus)) {
      throw new InvalidTransitionError(from, toStatus);
    }

    const phase: IncidentTimelinePhase =
      toStatus === "INVESTIGATING" ? "INVESTIGATION" : toStatus === "MITIGATING" ? "MITIGATION" : toStatus === "MONITORING" ? "RECOVERY" : "RESOLUTION";

    const resolvedAt = toStatus === "RESOLVED" ? "now()" : "resolved_at";
    const { rows: updatedRows } = await client.query(
      `UPDATE incident SET status = $1, resolved_at = ${resolvedAt === "now()" ? "now()" : "resolved_at"} WHERE id = $2 RETURNING *`,
      [toStatus, incidentId]
    );

    await client.query(
      `INSERT INTO incident_timeline_event (incident_id, organization_id, phase, description, actor_user_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [incidentId, incident.organization_id, phase, note, callerIdentity.userId]
    );

    return updatedRows[0];
  });
}

export async function recordPostmortem(
  callerIdentity: { organizationId: string | null; role: Role },
  incidentId: string,
  postmortem: {
    impact: string;
    rootCause: string;
    detection: string;
    mitigation: string;
    recovery: string;
    correctiveActions: string;
  }
) {
  return runInTenantContext(callerIdentity, async (client) => {
    const { rows } = await client.query(
      `UPDATE incident SET
         postmortem_impact = $1,
         postmortem_root_cause = $2,
         postmortem_detection = $3,
         postmortem_mitigation = $4,
         postmortem_recovery = $5,
         postmortem_corrective_actions = $6
       WHERE id = $7
       RETURNING *`,
      [
        postmortem.impact,
        postmortem.rootCause,
        postmortem.detection,
        postmortem.mitigation,
        postmortem.recovery,
        postmortem.correctiveActions,
        incidentId
      ]
    );
    return rows[0] ?? null;
  });
}

export async function listIncidents(
  callerIdentity: { organizationId: string | null; role: Role },
  filters: { status?: IncidentStatus; limit: number; offset: number }
) {
  return runInTenantContext(callerIdentity, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(filters.limit, filters.offset);
    const { rows } = await client.query(
      `SELECT * FROM incident ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  });
}

export async function getIncidentWithTimeline(callerIdentity: { organizationId: string | null; role: Role }, incidentId: string) {
  return runInTenantContext(callerIdentity, async (client) => {
    const { rows: incidentRows } = await client.query(`SELECT * FROM incident WHERE id = $1`, [incidentId]);
    const incident = incidentRows[0];
    if (!incident) return null;
    const { rows: timeline } = await client.query(
      `SELECT * FROM incident_timeline_event WHERE incident_id = $1 ORDER BY created_at ASC`,
      [incidentId]
    );
    return { ...incident, timeline };
  });
}
