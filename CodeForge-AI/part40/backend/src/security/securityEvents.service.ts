import { runAsSystem, runInTenantContext } from "../db/tenantContext";
import { sanitizeForAudit } from "../lib/redaction";
import { baseLogger } from "../lib/logger";
import type { SecurityEventType, EventResult, SafeMetadata } from "../types/events";
import type { Role } from "../types/identity";
import { evaluateDetectionRules, trackAlertEvaluation } from "./alertEngine";

/**
 * SECURITY EVENT SYSTEM
 * -----------------------------------------------------------------------
 * The single write path for security_event rows. Middleware and feature
 * code call emitSecurityEvent() — nothing writes to that table directly.
 * After persisting, the event is hand ed to the alert engine so detection
 * rules see it in near-real-time (see security/alertEngine.ts) rather than
 * only on a batch scan.
 *
 * PII MINIMIZATION: metadata is passed through sanitizeForAudit() before
 * it ever reaches the database — callers should still avoid putting raw
 * request bodies / full student submissions / AI prompts in here as a
 * matter of habit, since "sanitize" strips known-secret shapes but is not
 * a substitute for deciding what's actually worth recording.
 *
 * Never throws into the caller's request path: a security-logging failure
 * must not be the reason a legitimate request 500s (AUDIT PERFORMANCE /
 * FAIL-SAFE RELIABILITY) — but it also must never be silently invisible,
 * so failures are logged at `error` level for operator visibility.
 */

export interface EmitSecurityEventInput {
  eventType: SecurityEventType;
  actorUserId: string | null;
  actorRole: Role | null;
  organizationId: string | null;
  resourceType?: string;
  resourceId?: string;
  result: EventResult;
  correlationId: string;
  ipAddress?: string;
  metadata?: SafeMetadata | Record<string, unknown>;
}

export interface SecurityEventRecord extends EmitSecurityEventInput {
  id: string;
  createdAt: string;
}

export async function emitSecurityEvent(input: EmitSecurityEventInput): Promise<void> {
  try {
    const safeMetadata = sanitizeForAudit(input.metadata ?? {});

    const record = await runAsSystem(async (client) => {
      const { rows } = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO security_event
           (event_type, actor_user_id, actor_role, organization_id, resource_type, resource_id, result, correlation_id, ip_address, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, created_at`,
        [
          input.eventType,
          input.actorUserId,
          input.actorRole,
          input.organizationId,
          input.resourceType ?? null,
          input.resourceId ?? null,
          input.result,
          input.correlationId,
          input.ipAddress ?? null,
          JSON.stringify(safeMetadata)
        ]
      );
      return rows[0];
    });

    if (!record) return;

    // Hand off to detection rules. Deliberately fire-and-forget-with-logging:
    // a slow/broken detection rule must never add latency to (or fail) the
    // request that triggered the underlying security event. (trackAlertEvaluation
    // only exists so tests can await eventual consistency deterministically —
    // see alertEngine.ts's flushPendingAlertEvaluationsForTests.)
    trackAlertEvaluation(
      evaluateDetectionRules({ ...input, id: record.id, createdAt: record.created_at }).catch((err) => {
        baseLogger.error({ err }, "alert_engine_evaluation_failed");
      })
    );
  } catch (err) {
    baseLogger.error({ err, eventType: input.eventType }, "security_event_emit_failed");
  }
}

export interface SecurityEventSearchFilters {
  organizationId: string | null; // null = platform-wide (caller must already be authorized for this — see routes/security.routes.ts)
  eventType?: SecurityEventType;
  actorUserId?: string;
  result?: EventResult;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

/**
 * AUDIT SEARCH (for security events specifically). Always runs inside
 * runInTenantContext with the caller's own identity — RLS is the final
 * backstop even if a filter is somehow miscomputed above this call.
 */
export async function searchSecurityEvents(
  callerIdentity: { organizationId: string | null; role: Role },
  filters: SecurityEventSearchFilters
) {
  return runInTenantContext(callerIdentity, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];

    function addCondition(sql: string, value: unknown) {
      params.push(value);
      conditions.push(sql.replace("?", `$${params.length}`));
    }

    if (filters.organizationId) addCondition("organization_id = ?", filters.organizationId);
    if (filters.eventType) addCondition("event_type = ?", filters.eventType);
    if (filters.actorUserId) addCondition("actor_user_id = ?", filters.actorUserId);
    if (filters.result) addCondition("result = ?", filters.result);
    if (filters.from) addCondition("created_at >= ?", filters.from);
    if (filters.to) addCondition("created_at <= ?", filters.to);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(filters.limit, filters.offset);

    const { rows } = await client.query(
      `SELECT id, event_type, actor_user_id, actor_role, organization_id, resource_type, resource_id,
              result, correlation_id, ip_address, metadata, created_at
       FROM security_event
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  });
}
