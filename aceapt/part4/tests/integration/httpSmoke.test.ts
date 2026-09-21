import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import { requireTestDbUrls, createTestStudent, ensureTestSkill, cleanupTestStudents, newAdminClient, newAppStore } from "./helpers.js";
import { PostgresStore } from "../../src/repositories/postgresStore.js";
import { buildApp } from "../../src/api/buildApp.js";

describe("live HTTP smoke test (real fetch, real Postgres, DEMO_MODE auth)", () => {
  const { appUrl, migrationUrl } = requireTestDbUrls();
  let admin: pg.Client;
  let store: PostgresStore;
  let app: FastifyInstance;
  let baseUrl: string;
  let studentId: string;
  let otherStudentId: string;
  const createdIds: string[] = [];

  before(async () => {
    admin = newAdminClient(migrationUrl);
    await admin.connect();
    await ensureTestSkill(admin, "percentage-fundamentals-smoke");
    await admin.query(
      `INSERT INTO skills (id, name, category, base_relevance, estimated_learn_minutes) VALUES ($1,$1,'test','{"PLACEMENT_PREP":0.9}',20) ON CONFLICT (id) DO NOTHING`,
      ["smoke-skill"]
    );
    studentId = await createTestStudent(admin);
    otherStudentId = await createTestStudent(admin);
    createdIds.push(studentId, otherStudentId);

    store = newAppStore(appUrl);
    app = buildApp({ store, demoMode: true, logger: false });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("expected a real listening address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app.close();
    await cleanupTestStudents(admin, createdIds);
    await admin.end();
    await store.close();
  });

  test("health check responds", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test("missing x-student-id header is rejected with 401, never silently defaulted", async () => {
    const res = await fetch(`${baseUrl}/api/path`);
    assert.equal(res.status, 401);
  });

  test("GET /api/path generates and returns a real path for a real student", async () => {
    const res = await fetch(`${baseUrl}/api/path`, { headers: { "x-student-id": studentId } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.studentId, studentId);
    assert.equal(body.versionNumber, 1);
    assert.ok(Array.isArray(body.nodes));
  });

  test("a second request for the same student returns the SAME version, not a fresh regeneration on every GET", async () => {
    const res = await fetch(`${baseUrl}/api/path`, { headers: { "x-student-id": studentId } });
    const body = await res.json();
    assert.equal(body.versionNumber, 1, "GET /api/path must not silently regenerate — only POST /api/path/regenerate should");
  });

  test("student B's request never returns student A's path data (end-to-end RLS through the real HTTP+auth+service stack)", async () => {
    const resA = await fetch(`${baseUrl}/api/path`, { headers: { "x-student-id": studentId } });
    const bodyA = await resA.json();
    const resB = await fetch(`${baseUrl}/api/path`, { headers: { "x-student-id": otherStudentId } });
    const bodyB = await resB.json();
    assert.notEqual(bodyA.id, bodyB.id);
    assert.equal(bodyB.studentId, otherStudentId);
  });

  test("full action lifecycle over real HTTP: today's plan -> start -> complete", async () => {
    const planRes = await fetch(`${baseUrl}/api/plan/today`, { headers: { "x-student-id": studentId } });
    assert.equal(planRes.status, 200);
    const plan = await planRes.json();
    assert.ok(plan.action?.id);
    assert.equal(plan.action.status, "PENDING");

    const startRes = await fetch(`${baseUrl}/api/actions/${plan.action.id}/start`, { method: "POST", headers: { "x-student-id": studentId } });
    assert.equal(startRes.status, 200);
    assert.equal((await startRes.json()).status, "IN_PROGRESS");

    const completeRes = await fetch(`${baseUrl}/api/actions/${plan.action.id}/complete`, {
      method: "POST",
      headers: { "x-student-id": studentId, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(completeRes.status, 200);
    assert.equal((await completeRes.json()).status, "COMPLETED");
  });

  test("student B cannot start student A's action even with a guessed/known action id (IDOR check over real HTTP)", async () => {
    const planRes = await fetch(`${baseUrl}/api/plan/today`, { headers: { "x-student-id": studentId } });
    const plan = await planRes.json();
    const res = await fetch(`${baseUrl}/api/actions/${plan.action.id}/start`, { method: "POST", headers: { "x-student-id": otherStudentId } });
    assert.equal(res.status, 404, "must read as not-found for the other student, not leak that the action exists");
  });

  test("regenerate is idempotent-safe under real concurrency: two simultaneous POSTs both succeed with distinct sequential versions", async () => {
    const freshStudent = await createTestStudent(admin);
    createdIds.push(freshStudent);
    await fetch(`${baseUrl}/api/path`, { headers: { "x-student-id": freshStudent } }); // establishes v1

    const [r1, r2] = await Promise.all([
      fetch(`${baseUrl}/api/path/regenerate`, { method: "POST", headers: { "x-student-id": freshStudent } }),
      fetch(`${baseUrl}/api/path/regenerate`, { method: "POST", headers: { "x-student-id": freshStudent } }),
    ]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    const [b1, b2] = [await r1.json(), await r2.json()];
    assert.notEqual(b1.versionNumber, b2.versionNumber, "concurrent regenerations must not collide on the same version number");
    const history = await (await fetch(`${baseUrl}/api/path/history`, { headers: { "x-student-id": freshStudent } })).json();
    const versionNumbers = history.map((v: any) => v.versionNumber);
    assert.equal(new Set(versionNumbers).size, versionNumbers.length, "no duplicate version numbers under concurrent regeneration");
  });
});
