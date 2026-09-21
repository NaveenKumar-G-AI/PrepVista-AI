import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { closePool } from "../src/db/pool";
import { resetDatabase, closeAdminClient } from "./dbAdmin";
import { runAsSystem } from "../src/db/tenantContext";
import { ORG_A, USERS, authHeader } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeAdminClient();
  await closePool();
});

async function createOpenAlert() {
  return runAsSystem(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO security_alert (rule_id, severity, title, description, organization_id, correlation_key)
       VALUES ('test_rule', 'MEDIUM', 'Test alert', 'Created directly for audit-trail test.', $1, 'test-corr-key')
       RETURNING *`,
      [ORG_A]
    );
    return rows[0];
  });
}

describe("GOLDEN AUDIT TEST — administrative action produces a reconstructable audit record", () => {
  it("acknowledging an alert (via the declarative withAudit path) writes a SUCCESS audit_event with actor, action, resource and after-state", async () => {
    const alert = await createOpenAlert();

    const ackRes = await request(app)
      .patch(`/api/security/alerts/${alert.id}/acknowledge`)
      .set(...authHeader(USERS.adminA));
    expect(ackRes.status).toBe(200);

    const searchRes = await request(app)
      .get("/api/audit/events")
      .query({ resourceId: alert.id })
      .set(...authHeader(USERS.adminA));

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.events.length).toBeGreaterThanOrEqual(1);

    const auditEvent = searchRes.body.events[0];
    // Reconstructable: who, what action, on which resource, under which
    // org, what the result was, and what changed.
    expect(auditEvent.actor_user_id).toBe(USERS.adminA.userId);
    expect(auditEvent.actor_role).toBe("ADMIN");
    expect(auditEvent.organization_id).toBe(ORG_A);
    expect(auditEvent.action).toBe("security_alert.acknowledge");
    expect(auditEvent.resource_type).toBe("security_alert");
    expect(auditEvent.resource_id).toBe(alert.id);
    expect(auditEvent.result).toBe("SUCCESS");
    expect(auditEvent.after_state).toMatchObject({ status: "ACKNOWLEDGED" });
    expect(typeof auditEvent.correlation_id).toBe("string");
    expect(auditEvent.correlation_id.length).toBeGreaterThan(0);
  });

  it("a manual incident status transition (direct recordAuditEvent path) is equally reconstructable, including the operator's note", async () => {
    const created = await request(app)
      .post("/api/incidents")
      .set(...authHeader(USERS.platformOperator))
      .send({ title: "Storage latency elevated", severity: "MEDIUM", organizationId: ORG_A, detectionNote: "p99 write latency above SLO." });
    expect(created.status).toBe(201);
    const incidentId = created.body.incident.id;

    const transitioned = await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set(...authHeader(USERS.platformOperator))
      .send({ status: "INVESTIGATING", note: "Paged storage on-call; confirmed disk IOPS throttling." });
    expect(transitioned.status).toBe(200);

    const searchRes = await request(app)
      .get("/api/audit/events")
      .query({ resourceId: incidentId, action: "incident.transition" })
      .set(...authHeader(USERS.platformOperator));

    expect(searchRes.body.events.length).toBe(1);
    const evt = searchRes.body.events[0];
    expect(evt.after_state).toMatchObject({ status: "INVESTIGATING" });
    expect(evt.metadata).toMatchObject({ note: "Paged storage on-call; confirmed disk IOPS throttling." });
  });

  it("a DENIED attempt at an admin action is itself recorded (not silently dropped)", async () => {
    // A student has no permission to acknowledge alerts at all.
    const alert = await createOpenAlert();
    const res = await request(app)
      .patch(`/api/security/alerts/${alert.id}/acknowledge`)
      .set(...authHeader(USERS.studentA));
    expect(res.status).toBe(403);

    // requirePermission's denial path records a security_event, not an
    // audit_event (the handler — and therefore withAudit — never ran).
    // Confirm that signal exists and is queryable by an authorized admin.
    const searchRes = await request(app)
      .get("/api/security/events")
      .query({ eventType: "AUTHORIZATION_DENIED" })
      .set(...authHeader(USERS.adminA));
    expect(searchRes.body.events.length).toBeGreaterThanOrEqual(1);
  });
});
