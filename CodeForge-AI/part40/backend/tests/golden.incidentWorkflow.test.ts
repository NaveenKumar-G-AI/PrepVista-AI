import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { closePool } from "../src/db/pool";
import { resetDatabase, closeAdminClient } from "./dbAdmin";
import { emitSecurityEvent } from "../src/security/securityEvents.service";
import { flushPendingAlertEvaluationsForTests } from "../src/security/alertEngine";
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

async function emitTenantViolation(actorUserId: string) {
  await emitSecurityEvent({
    eventType: "TENANT_ISOLATION_VIOLATION",
    actorUserId,
    actorRole: "STUDENT",
    organizationId: ORG_A,
    result: "DENIED",
    correlationId: `incident-flow-${Date.now()}-${Math.random()}`
  });
  await flushPendingAlertEvaluationsForTests();
}

describe("GOLDEN INCIDENT TEST — Security Event -> Detection -> Alert -> Incident -> Operator Workflow -> Resolution", () => {
  it("repeated tenant-isolation violations escalate to a CRITICAL alert and auto-open an incident with a DETECTION+ALERT timeline", async () => {
    const actor = USERS.studentA.userId;

    // 1st and 2nd occurrence: HIGH, no incident yet.
    await emitTenantViolation(actor);
    await emitTenantViolation(actor);

    let alert = await runAsSystem(async (c) => {
      const { rows } = await c.query(`SELECT * FROM security_alert WHERE rule_id = 'tenant_isolation_violation'`);
      return rows[0];
    });
    expect(alert.severity).toBe("HIGH");
    expect(alert.occurrence_count).toBe(2);
    expect(alert.incident_id).toBeNull();

    // 3rd occurrence within the window crosses the CRITICAL threshold.
    await emitTenantViolation(actor);

    alert = await runAsSystem(async (c) => {
      const { rows } = await c.query(`SELECT * FROM security_alert WHERE rule_id = 'tenant_isolation_violation'`);
      return rows[0];
    });
    expect(alert.severity).toBe("CRITICAL");
    expect(alert.occurrence_count).toBe(3);
    expect(alert.incident_id).not.toBeNull();

    const incidentRes = await request(app)
      .get(`/api/incidents/${alert.incident_id}`)
      .set(...authHeader(USERS.platformOperator));

    expect(incidentRes.status).toBe(200);
    expect(incidentRes.body.incident.status).toBe("OPEN");
    expect(incidentRes.body.incident.severity).toBe("CRITICAL");
    const phases = incidentRes.body.incident.timeline.map((t: { phase: string }) => t.phase);
    expect(phases).toEqual(["DETECTION", "ALERT"]);
  });

  it("an out-of-order transition (OPEN -> MONITORING, skipping investigation/mitigation) is rejected with 409", async () => {
    const created = await request(app)
      .post("/api/incidents")
      .set(...authHeader(USERS.platformOperator))
      .send({ title: "Manual incident", severity: "HIGH", organizationId: ORG_A, detectionNote: "Manually opened for workflow test." });

    const res = await request(app)
      .patch(`/api/incidents/${created.body.incident.id}/status`)
      .set(...authHeader(USERS.platformOperator))
      .send({ status: "MONITORING", note: "skipping ahead" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("invalid_transition");
  });

  it("the full operator workflow runs OPEN -> INVESTIGATING -> MITIGATING -> MONITORING -> RESOLVED, each step timestamped on the timeline, then accepts a postmortem", async () => {
    const actor = USERS.studentA.userId;
    await emitTenantViolation(actor);
    await emitTenantViolation(actor);
    await emitTenantViolation(actor);

    const alert = await runAsSystem(async (c) => {
      const { rows } = await c.query(`SELECT * FROM security_alert WHERE rule_id = 'tenant_isolation_violation'`);
      return rows[0];
    });
    const incidentId = alert.incident_id as string;

    const steps: Array<{ status: string; note: string }> = [
      { status: "INVESTIGATING", note: "Confirmed repeated cross-org access attempts from the same account." },
      { status: "MITIGATING", note: "Revoked all active sessions for the offending account." },
      { status: "MONITORING", note: "No further violations observed for 15 minutes." },
      { status: "RESOLVED", note: "Confirmed account was a compromised student credential; access revoked." }
    ];

    for (const step of steps) {
      const res = await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set(...authHeader(USERS.platformOperator))
        .send(step);
      expect(res.status).toBe(200);
      expect(res.body.incident.status).toBe(step.status);
    }

    const finalRes = await request(app).get(`/api/incidents/${incidentId}`).set(...authHeader(USERS.platformOperator));
    expect(finalRes.body.incident.status).toBe("RESOLVED");
    expect(finalRes.body.incident.resolved_at).not.toBeNull();
    const phases = finalRes.body.incident.timeline.map((t: { phase: string }) => t.phase);
    expect(phases).toEqual(["DETECTION", "ALERT", "INVESTIGATION", "MITIGATION", "RECOVERY", "RESOLUTION"]);

    const postmortemRes = await request(app)
      .put(`/api/incidents/${incidentId}/postmortem`)
      .set(...authHeader(USERS.platformOperator))
      .send({
        impact: "One student account could read another organization's audit trail metadata for ~4 minutes.",
        rootCause: "Compromised student credential used to probe cross-organization resource IDs.",
        detection: "tenant_isolation_violation detection rule crossed the 3-occurrence/60-minute threshold.",
        mitigation: "All active sessions for the account were revoked; account flagged for TPO review.",
        recovery: "No further violations observed; RLS denied every attempted read throughout.",
        correctiveActions: "Add automated session revocation on CRITICAL tenant-isolation alerts."
      });

    expect(postmortemRes.status).toBe(200);
    expect(postmortemRes.body.incident.postmortem_root_cause).toContain("Compromised student credential");

    // The originating alert can now be resolved by an operator too.
    const resolveAlertRes = await request(app)
      .patch(`/api/security/alerts/${alert.id}/resolve`)
      .set(...authHeader(USERS.platformOperator));
    expect(resolveAlertRes.status).toBe(200);
    expect(resolveAlertRes.body.alert.status).toBe("RESOLVED");
  });
});
