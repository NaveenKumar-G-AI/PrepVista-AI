import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { closePool } from "../src/db/pool";
import { resetDatabase, closeAdminClient } from "./dbAdmin";
import { recordAuditEvent, searchAuditEvents } from "../src/audit/audit.service";
import { emitSecurityEvent, searchSecurityEvents } from "../src/security/securityEvents.service";
import { createIncident } from "../src/incidents/incident.service";
import { ORG_A, ORG_B, USERS, authHeader } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeAdminClient();
  await closePool();
});

describe("GOLDEN TENANT ISOLATION TEST — Organization A vs Organization B", () => {
  it("audit_event: an Org B admin searching audit events sees zero Org A rows; Org A admin sees them", async () => {
    await recordAuditEvent({
      actorUserId: USERS.adminA.userId,
      actorRole: "ADMIN",
      organizationId: ORG_A,
      action: "security_config.update",
      eventType: "SECURITY_CONFIGURATION_CHANGE",
      result: "SUCCESS",
      correlationId: "test-corr-1"
    });

    const asOrgB = await searchAuditEvents(USERS.adminB, { organizationId: ORG_B, limit: 50, offset: 0 });
    expect(asOrgB).toHaveLength(0);

    const asOrgA = await searchAuditEvents(USERS.adminA, { organizationId: ORG_A, limit: 50, offset: 0 });
    expect(asOrgA.length).toBeGreaterThanOrEqual(1);
    expect(asOrgA[0].action).toBe("security_config.update");
  });

  it("security_event: cross-org visibility is fully denied at the RLS layer", async () => {
    await emitSecurityEvent({
      eventType: "ADMIN_ACTION",
      actorUserId: USERS.adminA.userId,
      actorRole: "ADMIN",
      organizationId: ORG_A,
      result: "SUCCESS",
      correlationId: "test-corr-2"
    });

    const asOrgB = await searchSecurityEvents(USERS.adminB, { organizationId: ORG_B, limit: 50, offset: 0 });
    expect(asOrgB).toHaveLength(0);

    const asOrgA = await searchSecurityEvents(USERS.adminA, { organizationId: ORG_A, limit: 50, offset: 0 });
    expect(asOrgA.length).toBeGreaterThanOrEqual(1);
  });

  it("HTTP: Org B admin fetching an Org A incident by id gets 404, not the resource and not a 403 that would confirm it exists", async () => {
    const incident = await createIncident({
      title: "Database connection pool exhausted",
      severity: "HIGH",
      organizationId: ORG_A,
      affectedServices: ["database"],
      actorUserId: USERS.adminA.userId,
      detectionNote: "Latency spike observed on /api/health/dependencies."
    });

    const res = await request(app)
      .get(`/api/incidents/${incident.id}`)
      .set(...authHeader(USERS.adminB));

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("Database connection pool exhausted");
  });

  it("HTTP: the SAME incident IS visible to the owning org's admin", async () => {
    const incident = await createIncident({
      title: "Queue backlog growing",
      severity: "MEDIUM",
      organizationId: ORG_A,
      affectedServices: ["queue"],
      actorUserId: USERS.adminA.userId,
      detectionNote: "Oldest waiting job exceeds threshold."
    });

    const res = await request(app)
      .get(`/api/incidents/${incident.id}`)
      .set(...authHeader(USERS.adminA));

    expect(res.status).toBe(200);
    expect(res.body.incident.title).toBe("Queue backlog growing");
  });

  it("PLATFORM_OPERATOR legitimately sees across organizations (not a violation — a distinct, permission-gated role)", async () => {
    await recordAuditEvent({
      actorUserId: USERS.adminA.userId,
      actorRole: "ADMIN",
      organizationId: ORG_A,
      action: "budget.update",
      eventType: "ADMIN_ACTION",
      result: "SUCCESS",
      correlationId: "test-corr-3"
    });
    await recordAuditEvent({
      actorUserId: USERS.adminB.userId,
      actorRole: "ADMIN",
      organizationId: ORG_B,
      action: "budget.update",
      eventType: "ADMIN_ACTION",
      result: "SUCCESS",
      correlationId: "test-corr-4"
    });

    const res = await request(app)
      .get("/api/audit/events")
      .set(...authHeader(USERS.platformOperator));

    expect(res.status).toBe(200);
    const orgIds = new Set(res.body.events.map((e: { organization_id: string }) => e.organization_id));
    expect(orgIds.has(ORG_A)).toBe(true);
    expect(orgIds.has(ORG_B)).toBe(true);
  });
});
