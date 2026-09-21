import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const ADMIN_URL = process.env.PG_ADMIN_URL ?? "postgresql://postgres:postgres_dev@localhost:5432/aceapt_qve";

describe("Postgres security model (live, spec §149-153)", () => {
  let adminPool: pg.Pool;
  let tenantA: string;
  let tenantB: string;
  let questionA: string;
  let runId: string;

  beforeAll(async () => {
    adminPool = new pg.Pool({ connectionString: ADMIN_URL });

    // Seed as postgres/qve_owner-equivalent (admin connection bypasses RLS via
    // qve_owner's BYPASSRLS — see migration 003) so fixtures exist to test against.
    const tA = await adminPool.query(`INSERT INTO questions (tenant_id, is_global) VALUES (gen_random_uuid(), false) RETURNING id, tenant_id`);
    tenantA = tA.rows[0].tenant_id;
    questionA = tA.rows[0].id;
    const tB = await adminPool.query(`INSERT INTO questions (tenant_id, is_global) VALUES (gen_random_uuid(), false) RETURNING tenant_id`);
    tenantB = tB.rows[0].tenant_id;

    const version = await adminPool.query(
      `INSERT INTO question_versions (question_id, version_number, content_hash, status, snapshot_json) VALUES ($1, 1, 'hash1', 'PUBLISHED', '{}'::jsonb) RETURNING id`,
      [questionA]
    );

    const run = await adminPool.query(`SELECT qve_insert_validation_run($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) AS id`, [
      tenantA,
      questionA,
      version.rows[0].id,
      1,
      "hash1",
      "STANDARD",
      "PRACTICE_PROFILE",
      "INVALID",
      "CRITICAL",
      ["ANSWER_MISMATCH"],
      false,
      false,
      false,
      JSON.stringify({ ANSWER_VALIDATOR: "1.0.0" }),
      "CONTENT_EDITOR",
      "editor-1",
      new Date().toISOString(),
      new Date().toISOString(),
      JSON.stringify([
        {
          validator_name: "ANSWER_VALIDATOR",
          category: "ANSWER",
          validator_version: "1.0.0",
          status: "FAIL",
          severity: "CRITICAL",
          code: "ANSWER_MISMATCH",
          message: "declared answer is 125, derived is 100",
          evidence: { declaredAnswer: 125, derivedAnswer: 100 },
          duration_ms: 5,
          validated_at: new Date().toISOString()
        }
      ])
    ]);
    runId = run.rows[0].id;
  });

  afterAll(async () => {
    await adminPool.end();
  });

  it("qve_app has ZERO raw grants on any table (live permission-denied test)", async () => {
    const client = await adminPool.connect();
    try {
      await client.query("SET ROLE qve_app");
      await expect(client.query("SELECT * FROM question_validation_runs")).rejects.toThrow(/permission denied/i);
      await expect(client.query("INSERT INTO questions (tenant_id, is_global) VALUES (NULL, true)")).rejects.toThrow(/permission denied/i);
      await expect(client.query("DELETE FROM question_validation_results")).rejects.toThrow(/permission denied/i);
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });

  it("qve_app CAN read via the SECURITY DEFINER function scoped to its own tenant", async () => {
    const client = await adminPool.connect();
    try {
      await client.query("SET ROLE qve_app");
      const { rows } = await client.query("SELECT qve_get_run_by_id($1,$2,$3) AS run", [tenantA, "REVIEWER", runId]);
      expect(rows[0].run).not.toBeNull();
      expect(rows[0].run.overallStatus).toBe("INVALID");
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });

  it("TENANT ISOLATION: tenant B cannot read tenant A's validation run through the function (spec §152, §212)", async () => {
    const client = await adminPool.connect();
    try {
      await client.query("SET ROLE qve_app");
      const { rows } = await client.query("SELECT qve_get_run_by_id($1,$2,$3) AS run", [tenantB, "REVIEWER", runId]);
      expect(rows[0].run).toBeNull(); // not "access denied" — indistinguishable from "not found", on purpose
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });

  it("ADMIN/SYSTEM roles can read across tenants (spec §151)", async () => {
    const client = await adminPool.connect();
    try {
      await client.query("SET ROLE qve_app");
      const { rows } = await client.query("SELECT qve_get_run_by_id($1,$2,$3) AS run", [tenantB, "ADMIN", runId]);
      expect(rows[0].run).not.toBeNull();
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });

  it("qve_owner has BYPASSRLS and qve_app does not (structural confirmation)", async () => {
    const { rows } = await adminPool.query("SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('qve_owner','qve_app') ORDER BY rolname");
    expect(rows).toEqual([
      { rolname: "qve_app", rolbypassrls: false },
      { rolname: "qve_owner", rolbypassrls: true }
    ]);
  });

  it("RLS is FORCED (not just enabled) on every Feature 54 table — even the owner is subject to it without BYPASSRLS", async () => {
    const { rows } = await adminPool.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relname IN ('question_validation_runs','question_validation_results','validation_issues','validation_audit_events','questions','question_versions')
       ORDER BY relname`
    );
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });
});
