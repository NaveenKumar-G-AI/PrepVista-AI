import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { requireTestDbUrls, createTestStudent, ensureTestSkill, cleanupTestStudents, newAdminClient, newAppStore } from "./helpers.js";
import { PostgresStore } from "../../src/repositories/postgresStore.js";
import { emptyEvidence } from "../../src/domain/types.js";

describe("RLS isolation (real Postgres, real aceapt_app role)", () => {
  const { appUrl, migrationUrl } = requireTestDbUrls();
  let admin: pg.Client;
  let store: PostgresStore;
  let studentA: string;
  let studentB: string;
  const createdIds: string[] = [];

  before(async () => {
    admin = newAdminClient(migrationUrl);
    await admin.connect();
    store = newAppStore(appUrl);
    await ensureTestSkill(admin);
    studentA = await createTestStudent(admin);
    studentB = await createTestStudent(admin);
    createdIds.push(studentA, studentB);
  });

  after(async () => {
    await cleanupTestStudents(admin, createdIds);
    await admin.end();
    await (store as any).close();
  });

  test("a student can read their own evidence", async () => {
    await store.upsertEvidence({ ...emptyEvidence(studentA, "test-skill-root"), foundation: { accuracy: 0.5, attempts: 3, avgResponseTimeMs: null, lastAssessedAt: null } });
    const map = await store.getEvidenceForStudent(studentA);
    assert.ok(map.has("test-skill-root"));
  });

  test("student B's session cannot see student A's evidence, even though both rows are in the same table", async () => {
    await store.upsertEvidence({ ...emptyEvidence(studentA, "test-skill-root"), foundation: { accuracy: 0.9, attempts: 9, avgResponseTimeMs: null, lastAssessedAt: null } });
    const bMap = await store.getEvidenceForStudent(studentB);
    assert.equal(bMap.has("test-skill-root"), false, "student B must not see student A's row via a store method scoped to B's session");
  });

  test("fn_upsert_skill_evidence rejects writing evidence for a different student than the session identity", async () => {
    // Bypass the Store's own session-scoping to prove the DEFENSE-IN-DEPTH
    // check inside the SQL function itself — not just the app layer — by
    // opening a session as studentA and asking the function to write for
    // studentB. This must fail even though aceapt_app has EXECUTE on the
    // function, because fn_require_session_student re-checks the identity.
    const client = new pg.Pool({ connectionString: appUrl });
    const conn = await client.connect();
    try {
      await conn.query("BEGIN");
      await conn.query("SELECT set_config('app.current_student_id', $1, true)", [studentA]);
      await assert.rejects(
        () =>
          conn.query(`SELECT fn_upsert_skill_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
            studentB, // <-- mismatched on purpose
            "test-skill-root",
            JSON.stringify({ accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null }),
            JSON.stringify({ accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null }),
            JSON.stringify({ accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null }),
            JSON.stringify({ accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null }),
            "FOUNDATION",
            JSON.stringify([]),
            null,
          ]),
        /does not match session identity/
      );
      await conn.query("ROLLBACK");
    } finally {
      conn.release();
      await client.end();
    }
  });

  test("a raw SELECT with no session variable set sees zero rows for either student (default-deny)", async () => {
    const client = new pg.Pool({ connectionString: appUrl });
    const conn = await client.connect();
    try {
      // Deliberately no set_config call at all.
      const res = await conn.query("SELECT * FROM skill_evidence WHERE student_id = ANY($1)", [[studentA, studentB]]);
      assert.equal(res.rows.length, 0, "with app.current_student_id unset, RLS must default-deny rather than default-allow");
    } finally {
      conn.release();
      await client.end();
    }
  });

  test("aceapt_app has no UPDATE or DELETE grant on skill_evidence — writes only via the SECURITY DEFINER function", async () => {
    const res = await admin.query(
      `SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name = 'skill_evidence' AND grantee = 'aceapt_app'`
    );
    const privileges = res.rows.map((r) => r.privilege_type);
    assert.ok(privileges.includes("SELECT"));
    assert.ok(!privileges.includes("UPDATE"), `aceapt_app must not have UPDATE on skill_evidence, found: ${privileges.join(", ")}`);
    assert.ok(!privileges.includes("DELETE"), `aceapt_app must not have DELETE on skill_evidence, found: ${privileges.join(", ")}`);
    assert.ok(!privileges.includes("INSERT"), `aceapt_app must not have direct INSERT on skill_evidence, found: ${privileges.join(", ")}`);
  });

  test("aceapt_app is not a superuser and does not have BYPASSRLS", async () => {
    const res = await admin.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'aceapt_app'`);
    assert.equal(res.rows[0].rolsuper, false);
    assert.equal(res.rows[0].rolbypassrls, false);
  });
});
