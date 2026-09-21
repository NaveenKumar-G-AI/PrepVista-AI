import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { testPool, closeTestPool, createTestUser, getTemplateIdBySlug } from "./dbHelpers";
import { createIncidentInstance } from "@/lib/repo/instance";
import { assertIncidentOwnership, NotFoundError } from "@/lib/repo/authz";

describe("application-layer ownership checks (defense-in-depth alongside RLS)", () => {
  let db: Pool;
  let alice: string;
  let bob: string;
  let incidentId: string;

  beforeAll(async () => {
    db = testPool();
    alice = await createTestUser(db);
    bob = await createTestUser(db);
    const templateId = await getTemplateIdBySlug(db, "pf-2048");
    const instance = await createIncidentInstance(db, alice, templateId);
    incidentId = instance.id;
  });

  afterAll(async () => {
    await db.query("delete from incidents where id = $1", [incidentId]);
    await db.query("delete from auth.users where id in ($1,$2)", [alice, bob]);
    await closeTestPool();
  });

  it("passes silently for the actual owner", async () => {
    await expect(assertIncidentOwnership(db, incidentId, alice)).resolves.toBeUndefined();
  });

  it("throws NotFoundError (not a distinguishable 'forbidden') for a non-owner — brief: student B blocked from student A's incident", async () => {
    await expect(assertIncidentOwnership(db, incidentId, bob)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError for an incident ID that doesn't exist at all", async () => {
    await expect(assertIncidentOwnership(db, "00000000-0000-4000-8000-000000000000", alice)).rejects.toThrow(NotFoundError);
  });

  it("a non-owner and a nonexistent ID produce the identical error type (no enumeration signal)", async () => {
    let nonOwnerErr: unknown;
    let missingErr: unknown;
    try {
      await assertIncidentOwnership(db, incidentId, bob);
    } catch (e) {
      nonOwnerErr = e;
    }
    try {
      await assertIncidentOwnership(db, "00000000-0000-4000-8000-000000000000", alice);
    } catch (e) {
      missingErr = e;
    }
    expect(nonOwnerErr).toBeInstanceOf(NotFoundError);
    expect(missingErr).toBeInstanceOf(NotFoundError);
    expect((nonOwnerErr as Error).message).toBe((missingErr as Error).message);
  });
});
