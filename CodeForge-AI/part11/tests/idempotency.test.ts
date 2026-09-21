import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { testPool, closeTestPool, createTestUser, getTemplateIdBySlug } from "./dbHelpers";
import { createIncidentInstance } from "@/lib/repo/instance";
import { recordActionIfNew, listActions } from "@/lib/repo/investigation";

describe("action idempotency (brief CRITICAL TEST CASE: duplicate action request -> idempotent behavior)", () => {
  let db: Pool;
  let userId: string;
  let templateId: string;
  let incidentId: string;

  beforeAll(async () => {
    db = testPool();
    userId = await createTestUser(db);
    templateId = await getTemplateIdBySlug(db, "pf-2048");
    const instance = await createIncidentInstance(db, userId, templateId);
    incidentId = instance.id;
  });

  afterAll(async () => {
    await db.query("delete from incidents where id = $1", [incidentId]);
    await db.query("delete from auth.users where id = $1", [userId]);
    await closeTestPool();
  });

  it("a repeated request with the same idempotency key does not create a second row", async () => {
    const key = "rollback-attempt-1";
    const first = await recordActionIfNew(db, incidentId, userId, {
      actionType: "ROLLBACK",
      targetServiceKey: "placement-api",
      idempotencyKey: key,
      params: { confirmed: true },
      result: { narrative: "rolled back" },
      simMinutesAt: 5,
    });
    const second = await recordActionIfNew(db, incidentId, userId, {
      actionType: "ROLLBACK",
      targetServiceKey: "placement-api",
      idempotencyKey: key, // same key, simulating a network retry
      params: { confirmed: true },
      result: { narrative: "rolled back" },
      simMinutesAt: 999, // even if the retried request claims a different time...
    });

    expect(first.wasNew).toBe(true);
    expect(second.wasNew).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    expect(second.row.simMinutesAt).toBe(5); // ...the ORIGINAL row wins, not the retry

    const all = await listActions(db, incidentId);
    expect(all.filter((a) => a.idempotencyKey === key)).toHaveLength(1);
  });

  it("a different idempotency key on the same incident is a genuinely new action", async () => {
    await recordActionIfNew(db, incidentId, userId, {
      actionType: "INSPECT_LOGS",
      targetServiceKey: null,
      idempotencyKey: "inspect-1",
      params: {},
      result: {},
      simMinutesAt: 1,
    });
    await recordActionIfNew(db, incidentId, userId, {
      actionType: "INSPECT_LOGS",
      targetServiceKey: null,
      idempotencyKey: "inspect-2",
      params: {},
      result: {},
      simMinutesAt: 2,
    });
    const all = await listActions(db, incidentId);
    expect(all.filter((a) => a.actionType === "INSPECT_LOGS")).toHaveLength(2);
  });
});
