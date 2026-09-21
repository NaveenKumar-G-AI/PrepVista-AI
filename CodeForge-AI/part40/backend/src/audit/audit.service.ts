import { runAsSystem, runInTenantContext } from "../db/tenantContext";
import { sanitizeForAudit } from "../lib/redaction";
import { baseLogger } from "../lib/logger";
import { env } from "../config/env";
import type { EventResult } from "../types/events";
import type { Role } from "../types/identity";

/**
 * CENTRAL AUDIT SYSTEM
 * -----------------------------------------------------------------------
 * "Who did what, to which resource, when, under which organization, and
 * what was the result?" — this is the ONE audit mechanism for the
 * platform. Other CodeForge features should call recordAuditEvent()
 * rather than rolling their own audit table (see
 * middleware/auditMiddleware.ts for the declarative, route-level way
 * most handlers will use this without calling it directly).
 *
 * before_state/after_state are sanitized + intentionally minimized — this
 * is a reconstructable record of the change, not a full entity dump. A
 * good before/after pair for "role changed" is
 * { role: "STUDENT" } -> { role: "TRAINER" }, not the user's entire row.
 */

export interface RecordAuditEventInput {
  actorUserId: string | null;
  actorRole: Role | null;
  organizationId: string | null;
  action: string; // "resource.verb", e.g. "security_config.update"
  eventType: string; // coarser category, mirrors SecurityEventType where applicable
  resourceType?: string;
  resourceId?: string;
  result: EventResult;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: Record<string, unknown>;
  correlationId: string;
  requestId?: string;
}

export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  try {
    await runAsSystem(async (client) => {
      await client.query(
        `INSERT INTO audit_event
           (actor_user_id, actor_role, organization_id, action, event_type, resource_type, resource_id,
            result, before_state, after_state, metadata, correlation_id, request_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          input.actorUserId,
          input.actorRole,
          input.organizationId,
          input.action,
          input.eventType,
          input.resourceType ?? null,
          input.resourceId ?? null,
          input.result,
          input.beforeState !== undefined ? JSON.stringify(sanitizeForAudit(input.beforeState)) : null,
          input.afterState !== undefined ? JSON.stringify(sanitizeForAudit(input.afterState)) : null,
          JSON.stringify(sanitizeForAudit(input.metadata ?? {})),
          input.correlationId,
          input.requestId ?? null
        ]
      );
    });
  } catch (err) {
    // AUDIT PERFORMANCE / FAIL-SAFE RELIABILITY: an audit-write failure
    // must not fail the underlying business operation it's recording —
    // but MUST be loud in logs, since a silently-dropped audit record for
    // an admin action is exactly the failure mode this feature exists to
    // prevent. If CodeForge's real deployment needs a stronger guarantee
    // than "log loudly and continue" (e.g. a durable outbox / dead-letter
    // queue for failed audit writes), that belongs here.
    baseLogger.error({ err, action: input.action }, "audit_event_write_failed");
  }
}

export interface AuditSearchFilters {
  organizationId: string | null;
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  result?: EventResult;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

/**
 * AUDIT SEARCH + AUDIT ACCESS CONTROL
 * -----------------------------------------------------------------------
 * Always executes inside the caller's own tenant context — a
 * TPO/Admin can only ever see rows RLS resolves for their organization; a
 * Platform Operator can see across organizations (see migrations/007 and
 * db/tenantContext.ts). There is no parameter that lets a non-operator
 * widen this beyond their own org, by design.
 */
export async function searchAuditEvents(callerIdentity: { organizationId: string | null; role: Role }, filters: AuditSearchFilters) {
  return runInTenantContext(callerIdentity, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];

    function addCondition(sql: string, value: unknown) {
      params.push(value);
      conditions.push(sql.replace("?", `$${params.length}`));
    }

    if (filters.organizationId) addCondition("organization_id = ?", filters.organizationId);
    if (filters.actorUserId) addCondition("actor_user_id = ?", filters.actorUserId);
    if (filters.action) addCondition("action = ?", filters.action);
    if (filters.resourceType) addCondition("resource_type = ?", filters.resourceType);
    if (filters.resourceId) addCondition("resource_id = ?", filters.resourceId);
    if (filters.result) addCondition("result = ?", filters.result);
    if (filters.from) addCondition("created_at >= ?", filters.from);
    if (filters.to) addCondition("created_at <= ?", filters.to);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(filters.limit, filters.offset);

    const { rows } = await client.query(
      `SELECT id, actor_user_id, actor_role, organization_id, action, event_type, resource_type, resource_id,
              result, before_state, after_state, metadata, correlation_id, request_id, created_at
       FROM audit_event
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  });
}

export async function getAuditEventById(callerIdentity: { organizationId: string | null; role: Role }, id: string) {
  return runInTenantContext(callerIdentity, async (client) => {
    const { rows } = await client.query(`SELECT * FROM audit_event WHERE id = $1`, [id]);
    return rows[0] ?? null; // RLS returns nothing for another org's event — indistinguishable from "doesn't exist"
  });
}

/**
 * RETENTION — the only path by which audit/security/health rows are ever
 * deleted (see migrations/007's SECURITY DEFINER purge_expired_events).
 * Intended to run on a schedule (e.g. a daily cron/worker job in the host
 * repo), not on every request.
 */
export async function purgeExpiredEvents() {
  return runAsSystem(async (client) => {
    const { rows } = await client.query<{ audit_deleted: string; security_deleted: string; health_deleted: string }>(
      `SELECT * FROM purge_expired_events($1, $2, 30)`,
      [env.AUDIT_RETENTION_DAYS, env.SECURITY_EVENT_RETENTION_DAYS]
    );
    return rows[0];
  });
}
