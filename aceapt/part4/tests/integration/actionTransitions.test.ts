import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { requireTestDbUrls, createTestStudent, ensureTestSkill, cleanupTestStudents, newAdminClient, newAppStore } from "./helpers.js";
import { PostgresStore } from "../../src/repositories/postgresStore.js";
import { newId } from "../../src/repositories/inMemoryStore.js";
import type { LearningAction } from "../../src/domain/types.js";

function draftAction(studentId: string, skillId: string): LearningAction {
  return {
    id: newId("action"),
    studentId,
    skillId,
    actionType: "PRACTICE",
    reason: "test",
    priority: 0.5,
    estimatedDuration: 15,
    targetCapability: "test",
    difficulty: "FOUNDATION",
    evidenceBasis: [],
    status: "PENDING",
    interventionType: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    resultingEvidenceSummary: null,
  };
}

describe("fn_transition_action (real Postgres)", () => {
  const { appUrl, migrationUrl } = requireTestDbUrls();
  let admin: pg.Client;
  let store: PostgresStore;
  let studentId: string;
  const createdIds: string[] = [];

  before(async () => {
    admin = newAdminClient(migrationUrl);
    await admin.connect();
    store = newAppStore(appUrl);
    await ensureTestSkill(admin);
    studentId = await createTestStudent(admin);
    createdIds.push(studentId);
  });

  after(async () => {
    await cleanupTestStudents(admin, createdIds);
    await admin.end();
    await (store as any).close();
  });

  test("legal transition PENDING -> IN_PROGRESS -> COMPLETED", async () => {
    const created = await store.createAction(draftAction(studentId, "test-skill-root"));
    const started = await store.transitionAction(studentId, created.id, "IN_PROGRESS");
    assert.equal(started.status, "IN_PROGRESS");
    assert.ok(started.startedAt);
    const completed = await store.transitionAction(studentId, created.id, "COMPLETED");
    assert.equal(completed.status, "COMPLETED");
    assert.ok(completed.completedAt);
  });

  test("illegal transition PENDING -> COMPLETED is rejected", async () => {
    const created = await store.createAction(draftAction(studentId, "test-skill-root"));
    await assert.rejects(() => store.transitionAction(studentId, created.id, "COMPLETED"), /cannot transition/);
  });

  test("a completed action cannot be transitioned again (terminal state)", async () => {
    const created = await store.createAction(draftAction(studentId, "test-skill-root"));
    await store.transitionAction(studentId, created.id, "IN_PROGRESS");
    await store.transitionAction(studentId, created.id, "COMPLETED");
    await assert.rejects(() => store.transitionAction(studentId, created.id, "IN_PROGRESS"), /terminal status/);
  });

  test("PENDING -> SKIPPED is legal without ever starting (Phase 41 agency)", async () => {
    const created = await store.createAction(draftAction(studentId, "test-skill-root"));
    const skipped = await store.transitionAction(studentId, created.id, "SKIPPED");
    assert.equal(skipped.status, "SKIPPED");
  });

  test("IN_PROGRESS -> POSTPONED -> IN_PROGRESS (pause and resume)", async () => {
    const created = await store.createAction(draftAction(studentId, "test-skill-root"));
    await store.transitionAction(studentId, created.id, "IN_PROGRESS");
    const postponed = await store.transitionAction(studentId, created.id, "POSTPONED");
    assert.equal(postponed.status, "POSTPONED");
    const resumed = await store.transitionAction(studentId, created.id, "IN_PROGRESS");
    assert.equal(resumed.status, "IN_PROGRESS");
    assert.equal(resumed.startedAt, postponed.startedAt, "startedAt should not reset on resume");
  });

  test("concurrent completion attempts: exactly one succeeds, the other gets a clean rejection (row lock via FOR UPDATE)", async () => {
    const created = await store.createAction(draftAction(studentId, "test-skill-root"));
    await store.transitionAction(studentId, created.id, "IN_PROGRESS");

    const results = await Promise.allSettled([
      store.transitionAction(studentId, created.id, "COMPLETED"),
      store.transitionAction(studentId, created.id, "COMPLETED"),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one concurrent COMPLETED call should win");
    assert.equal(rejected.length, 1, "the other should be rejected, not silently double-applied");
  });
});
