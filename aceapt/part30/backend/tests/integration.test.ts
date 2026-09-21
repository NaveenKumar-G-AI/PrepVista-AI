import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { adminPool, pool } from "../src/db/pool.js";

/**
 * These tests hit a real Postgres instance (the same one `npm run migrate`
 * targets) through the real Express app -- no mocking. They exist to catch
 * exactly the class of bug unit tests can't: RLS policy mistakes, pg client
 * concurrency issues, and wiring problems between routes/engine/db that
 * only show up when a real request actually round-trips through all of
 * them. Requires `npm run migrate` to have been run against PGDATABASE
 * first (see README).
 */

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const STUDENT_A = randomUUID();
const STUDENT_B = randomUUID();
const TARGET_A = randomUUID();

const app = createApp();

beforeAll(async () => {
  const c = await adminPool.connect();
  try {
    await c.query(`INSERT INTO tenants (id, name) VALUES ($1,'Test Tenant A'), ($2,'Test Tenant B')`, [TENANT_A, TENANT_B]);
    await c.query(`INSERT INTO students (id, tenant_id, full_name, email) VALUES ($1,$2,'Test Student A','a@test.dev')`, [STUDENT_A, TENANT_A]);
    await c.query(`INSERT INTO students (id, tenant_id, full_name, email) VALUES ($1,$2,'Test Student B','b@test.dev')`, [STUDENT_B, TENANT_B]);
    await c.query(`INSERT INTO capabilities (code, tenant_id, name, category) VALUES ('test.cap_a',$1,'Capability A','core')`, [TENANT_A]);
    await c.query(`INSERT INTO targets (id, tenant_id, code, name, description) VALUES ($1,$2,'test-target','Test Target','')`, [TARGET_A, TENANT_A]);
    await c.query(`INSERT INTO target_requirements (target_id, capability_code, required_level, weight, min_evidence) VALUES ($1,'test.cap_a',80,1,2)`, [TARGET_A]);
  } finally {
    c.release();
  }
});

afterAll(async () => {
  const c = await adminPool.connect();
  try {
    await c.query(`DELETE FROM tenants WHERE id = ANY($1)`, [[TENANT_A, TENANT_B]]);
  } finally {
    c.release();
  }
  await pool.end();
  await adminPool.end();
});

function headersFor(tenantId: string, studentId: string) {
  return { "x-tenant-id": tenantId, "x-student-id": studentId };
}

describe("auth", () => {
  it("rejects a request with no tenant/student headers", async () => {
    const res = await request(app).get("/api/path/current");
    expect(res.status).toBe(401);
  });
});

describe("empty state", () => {
  it("returns the Section 52 empty state for a student with no target yet", async () => {
    const res = await request(app).get("/api/path/current").set(headersFor(TENANT_A, STUDENT_A));
    expect(res.status).toBe(200);
    expect(res.body.empty).toBe(true);
  });
});

describe("the full loop, live", () => {
  it("creates a path, generates structure, and produces an evidence-grounded (not fabricated) initial state", async () => {
    const res = await request(app)
      .post("/api/path/target")
      .set(headersFor(TENANT_A, STUDENT_A))
      .send({ targetId: TARGET_A, slot: "PRIMARY", deadlineDays: 30 });
    expect(res.status).toBe(200);
    expect(res.body.dashboard.stages.length).toBeGreaterThan(0);
    expect(res.body.dashboard.milestones.length).toBeGreaterThan(0);
    // No evidence yet -- must not fabricate a bottleneck or a nonzero readiness.
    expect(res.body.dashboard.bottleneck).toBeNull();
    expect(res.body.dashboard.path.readiness).toBe(0);
  });

  it("completing an action records evidence and changes the dashboard on the very next read", async () => {
    const before = await request(app).get(`/api/path/current?targetId=${TARGET_A}`).set(headersFor(TENANT_A, STUDENT_A));
    const actionId = before.body.nextBestAction?.action?.id;
    expect(actionId).toBeTruthy();

    const complete = await request(app)
      .post(`/api/path/actions/${actionId}/complete`)
      .set(headersFor(TENANT_A, STUDENT_A))
      .send({ result: { correct: 9, total: 10, passed: true } });
    expect(complete.status).toBe(200);
    expect(complete.body.dashboard.path.readiness).toBeGreaterThan(0);

    const after = await request(app).get(`/api/path/current?targetId=${TARGET_A}`).set(headersFor(TENANT_A, STUDENT_A));
    expect(after.body.path.readiness).toBe(complete.body.dashboard.path.readiness);
  });

  it("rejects completing a PROVE action through the generic complete endpoint", async () => {
    const current = await request(app).get(`/api/path/current?targetId=${TARGET_A}`).set(headersFor(TENANT_A, STUDENT_A));
    if (current.body.nextBestAction?.action?.type === "PROVE") {
      const res = await request(app)
        .post(`/api/path/actions/${current.body.nextBestAction.action.id}/complete`)
        .set(headersFor(TENANT_A, STUDENT_A))
        .send({ result: {} });
      expect(res.status).toBe(400);
    }
  });
});

describe("row level security, exercised through real HTTP requests", () => {
  it("a student in tenant B gets 404, not tenant A's path, when asking for tenant A's target", async () => {
    const res = await request(app).get(`/api/path/current?targetId=${TARGET_A}`).set(headersFor(TENANT_B, STUDENT_B));
    expect(res.status).toBe(404);
  });

  it("a student cannot complete an action that belongs to a different student", async () => {
    const asA = await request(app).get(`/api/path/current?targetId=${TARGET_A}`).set(headersFor(TENANT_A, STUDENT_A));
    const actionId = asA.body.nextBestAction?.action?.id;
    if (actionId) {
      const res = await request(app)
        .post(`/api/path/actions/${actionId}/complete`)
        .set(headersFor(TENANT_B, STUDENT_B)) // wrong tenant AND wrong student
        .send({ result: { correct: 1, total: 1, passed: true } });
      expect(res.status).toBe(404);
    }
  });
});
