import crypto from "node:crypto";
import { runAsSystem } from "../db/tenantContext";
import { baseLogger } from "../lib/logger";
import { notificationAdapter } from "../adapters/notificationAdapter";
import type { AlertSeverity } from "../types/events";
import type { SecurityEventRecord } from "./securityEvents.service";

/**
 * SECURITY DETECTION RULES + SECURITY ALERT ENGINE + ALERT DEDUPLICATION
 * -----------------------------------------------------------------------
 * Security Event -> Detection Rule -> Signal -> Alert -> Authorized Operator
 *
 * Rules are intentionally simple, threshold-based, and evidence-based —
 * they count real persisted security_event rows within a bounded recent
 * window rather than pattern-matching on vibes, per the brief's "Detection
 * must remain evidence-based. Do not falsely label normal users as
 * attackers." Thresholds are conservative defaults; tune per real traffic
 * once this is wired into CodeForge (see docs/INTEGRATION_GUIDE.md).
 *
 * Deduplication: matching events within the same correlation window
 * UPDATE the same OPEN alert (occurrence_count++, last_seen_at bump)
 * instead of creating a new row — see the partial unique index in
 * migrations/004. That is what turns "thousands of events" into "one
 * alert with an occurrence count" rather than an alert storm.
 */

interface DetectionContext {
  event: SecurityEventRecord;
}

interface DetectionResult {
  fire: boolean;
  severity: AlertSeverity;
  title: string;
  description: string;
  /** Groups events that should collapse into the same alert. Keep it free of high-cardinality noise (no timestamps, no random ids). */
  correlationKey: string;
}

interface DetectionRule {
  id: string;
  /** Cheap pre-filter — avoids running the (DB-querying) evaluate() for events the rule can never care about. */
  appliesTo(event: SecurityEventRecord): boolean;
  evaluate(ctx: DetectionContext): Promise<DetectionResult | null>;
}

async function countRecentEvents(opts: {
  eventType: string;
  organizationId: string | null;
  ipAddress?: string | null;
  actorUserId?: string | null;
  windowMinutes: number;
}): Promise<number> {
  return runAsSystem(async (client) => {
    const conditions = ["event_type = $1", "created_at >= now() - ($2 || ' minutes')::interval"];
    const params: unknown[] = [opts.eventType, String(opts.windowMinutes)];

    if (opts.ipAddress) {
      params.push(opts.ipAddress);
      conditions.push(`ip_address = $${params.length}`);
    }
    if (opts.actorUserId) {
      params.push(opts.actorUserId);
      conditions.push(`actor_user_id = $${params.length}`);
    }
    if (opts.organizationId) {
      params.push(opts.organizationId);
      conditions.push(`organization_id = $${params.length}`);
    }

    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM security_event WHERE ${conditions.join(" AND ")}`,
      params
    );
    return Number(rows[0]?.count ?? 0);
  });
}

const repeatedLoginFailures: DetectionRule = {
  id: "repeated_login_failures",
  appliesTo: (e) => e.eventType === "LOGIN_FAILURE",
  async evaluate({ event }) {
    if (!event.ipAddress) return null;
    const count = await countRecentEvents({ eventType: "LOGIN_FAILURE", ipAddress: event.ipAddress, organizationId: null, windowMinutes: 15 });
    if (count < 5) return null;
    return {
      fire: true,
      severity: count >= 15 ? "HIGH" : "MEDIUM",
      title: "Repeated login failures",
      description: `${count} failed login attempts from the same source in the last 15 minutes.`,
      correlationKey: `ip:${event.ipAddress}`
    };
  }
};

const repeatedAuthorizationDenied: DetectionRule = {
  id: "repeated_authorization_denied",
  appliesTo: (e) => e.eventType === "AUTHORIZATION_DENIED",
  async evaluate({ event }) {
    if (!event.actorUserId) return null;
    const count = await countRecentEvents({
      eventType: "AUTHORIZATION_DENIED",
      actorUserId: event.actorUserId,
      organizationId: event.organizationId,
      windowMinutes: 10
    });
    if (count < 5) return null;
    return {
      fire: true,
      severity: count >= 20 ? "HIGH" : "MEDIUM",
      title: "Repeated authorization failures",
      description: `${count} authorization denials for the same user in the last 10 minutes — possible probing or a broken client.`,
      correlationKey: `user:${event.actorUserId}`
    };
  }
};

const tenantIsolationViolation: DetectionRule = {
  id: "tenant_isolation_violation",
  appliesTo: (e) => e.eventType === "TENANT_ISOLATION_VIOLATION",
  async evaluate({ event }) {
    // Even a single occurrence is significant — either an active
    // cross-tenant access attempt or an application bug producing
    // cross-org links. Escalates further only on repetition.
    const count = await countRecentEvents({
      eventType: "TENANT_ISOLATION_VIOLATION",
      actorUserId: event.actorUserId ?? undefined,
      organizationId: null,
      windowMinutes: 60
    });
    return {
      fire: true,
      severity: count >= 3 ? "CRITICAL" : "HIGH",
      title: "Cross-tenant access attempt",
      description: `Actor attempted to access a resource outside their organization (${count} occurrence(s) in the last hour).`,
      correlationKey: `user:${event.actorUserId ?? "unknown"}`
    };
  }
};

const repeatedRateLimitExceeded: DetectionRule = {
  id: "repeated_rate_limit_exceeded",
  appliesTo: (e) => e.eventType === "RATE_LIMIT_EXCEEDED",
  async evaluate({ event }) {
    const key = event.actorUserId ?? event.ipAddress ?? null;
    if (!key) return null;
    const count = await countRecentEvents({
      eventType: "RATE_LIMIT_EXCEEDED",
      actorUserId: event.actorUserId ?? undefined,
      ipAddress: event.actorUserId ? undefined : event.ipAddress ?? undefined,
      organizationId: null,
      windowMinutes: 15
    });
    if (count < 10) return null;
    return {
      fire: true,
      severity: count >= 40 ? "HIGH" : "LOW",
      title: "Sustained rate-limit violations",
      description: `${count} rate-limit rejections from the same source in the last 15 minutes — possible quota abuse.`,
      correlationKey: `source:${key}`
    };
  }
};

const repeatedDeniedAdminAction: DetectionRule = {
  id: "repeated_denied_admin_action",
  appliesTo: (e) => e.eventType === "ADMIN_ACTION" && e.result === "DENIED",
  async evaluate({ event }) {
    if (!event.actorUserId) return null;
    const count = await countRecentEvents({
      eventType: "ADMIN_ACTION",
      actorUserId: event.actorUserId,
      organizationId: event.organizationId,
      windowMinutes: 30
    });
    if (count < 3) return null;
    return {
      fire: true,
      severity: "HIGH",
      title: "Repeated unauthorized admin action attempts",
      description: `${count} denied admin-action attempts by the same user in the last 30 minutes — possible privilege-escalation attempt.`,
      correlationKey: `user:${event.actorUserId}`
    };
  }
};

const RULES: DetectionRule[] = [
  repeatedLoginFailures,
  repeatedAuthorizationDenied,
  tenantIsolationViolation,
  repeatedRateLimitExceeded,
  repeatedDeniedAdminAction
];

async function upsertAlert(rule: DetectionRule, result: DetectionResult, event: SecurityEventRecord) {
  const alert = await runAsSystem(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO security_alert (rule_id, severity, title, description, organization_id, correlation_key, occurrence_count, first_seen_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,1, now(), now())
       ON CONFLICT (rule_id, correlation_key) WHERE status = 'OPEN'
       DO UPDATE SET
         occurrence_count = security_alert.occurrence_count + 1,
         last_seen_at = now(),
         severity = GREATEST_SEVERITY(security_alert.severity, EXCLUDED.severity)
       RETURNING *, (xmax = 0) AS was_inserted`,
      [rule.id, result.severity, result.title, result.description, event.organizationId, result.correlationKey]
    );
    return rows[0];
  });

  return alert;
}

/** Severity ordering, mirrored in SQL by migrations/008's GREATEST_SEVERITY function (kept in the migration, not created at runtime — see that file's comment for why). */
export const SEVERITY_RANK: Record<AlertSeverity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

// Fire-and-forget bookkeeping (see securityEvents.service.ts — request
// handling never awaits rule evaluation, by design, so it can't add
// latency to the request that triggered the underlying event). Tests
// need a deterministic way to know evaluation has actually finished
// rather than sleeping/polling arbitrarily; production code never calls
// flushPendingAlertEvaluationsForTests.
const pendingEvaluations = new Set<Promise<unknown>>();

export function trackAlertEvaluation<T>(promise: Promise<T>): Promise<T> {
  pendingEvaluations.add(promise);
  const cleanup = () => pendingEvaluations.delete(promise);
  promise.then(cleanup, cleanup);
  return promise;
}

export async function flushPendingAlertEvaluationsForTests(): Promise<void> {
  await Promise.allSettled([...pendingEvaluations]);
}

export async function evaluateDetectionRules(event: SecurityEventRecord): Promise<void> {
  const applicable = RULES.filter((r) => r.appliesTo(event));
  for (const rule of applicable) {
    let result: DetectionResult | null;
    try {
      result = await rule.evaluate({ event });
    } catch (err) {
      baseLogger.error({ err, rule: rule.id }, "detection_rule_failed");
      continue;
    }
    if (!result?.fire) continue;

    const alert = await upsertAlert(rule, result, event);
    if (!alert) continue;

    await notificationAdapter.notifyOperators({
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      organizationId: alert.organization_id,
      alertId: alert.id
    });

    if (alert.severity === "CRITICAL" && !alert.incident_id) {
      // ALERT ESCALATION: a CRITICAL alert auto-opens an incident rather
      // than waiting for an operator to notice the dashboard.
      const { openIncidentFromAlert } = await import("../incidents/incident.service");
      await openIncidentFromAlert(alert);
    }
  }
}

export function alertRuleIds(): string[] {
  return RULES.map((r) => r.id);
}

// Exposed for tests that want a deterministic correlation key without
// depending on a random uuid, matching how upsertAlert derives one above.
export function correlationKeyForIp(ip: string): string {
  return `ip:${ip}`;
}
export function stableHash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}
