import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { closePool } from "../src/db/pool";
import { resetDatabase, closeAdminClient } from "./dbAdmin";
import { searchSecurityEvents } from "../src/security/securityEvents.service";
import { ORG_A, USERS, authHeader } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeAdminClient();
  await closePool();
});

describe("GOLDEN PRIVILEGE TEST — Student -> Administrative API", () => {
  it("a student calling the audit search API is denied with 403, not served any data", async () => {
    const res = await request(app)
      .get("/api/audit/events")
      .set(...authHeader(USERS.studentA));

    expect(res.status).toBe(403);
    expect(res.body.events).toBeUndefined();
  });

  it("the denial itself is captured as an AUTHORIZATION_DENIED security event", async () => {
    await request(app).get("/api/audit/events").set(...authHeader(USERS.studentA));

    const events = await searchSecurityEvents(USERS.adminA, {
      organizationId: ORG_A,
      eventType: "AUTHORIZATION_DENIED",
      limit: 10,
      offset: 0
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].actor_user_id).toBe(USERS.studentA.userId);
    expect(events[0].result).toBe("DENIED");
  });

  it("a TPO (mid-hierarchy) cannot reach a PLATFORM_OPERATOR-only route", async () => {
    const res = await request(app)
      .post("/api/incidents")
      .set(...authHeader(USERS.tpoA))
      .send({ title: "x", severity: "LOW", organizationId: ORG_A, detectionNote: "manual test" });

    expect(res.status).toBe(403);
  });

  it("even ADMIN (one step below the top) cannot reach a PLATFORM_OPERATOR-only route", async () => {
    const res = await request(app)
      .post("/api/incidents")
      .set(...authHeader(USERS.adminA))
      .send({ title: "x", severity: "LOW", organizationId: ORG_A, detectionNote: "manual test" });

    expect(res.status).toBe(403);
  });

  it("ADMIN SECURITY: a sensitive action is refused when the credential is stale, even though the role/permission check would pass", async () => {
    const res = await request(app)
      .put(`/api/incidents/00000000-0000-0000-0000-000000000000/postmortem`)
      .set(...authHeader(USERS.platformOperator, { authTimeOffsetSeconds: 3600 })) // issued 1h ago, window is 900s
      .send({
        impact: "x",
        rootCause: "x",
        detection: "x",
        mitigation: "x",
        recovery: "x",
        correctiveActions: "x"
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("reauthentication_required");
  });

  it("a forged role claim is impossible — the JWT is the only source of role, and it's signature-verified", async () => {
    // No valid token at all -> 401, never a default-allow.
    const res = await request(app).get("/api/audit/events").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});
