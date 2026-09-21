import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const CONN = process.env.DATABASE_URL_ADMIN ?? "postgres://postgres:localdevpw@localhost:5432/codeforge_dev";
const CONN_AUTH = process.env.DATABASE_URL_AUTH ?? "postgres://app_conn_authenticated:localdevpw@localhost:5432/codeforge_dev";
const CONN_SVC = process.env.DATABASE_URL_SVC ?? "postgres://app_conn_service:localdevpw@localhost:5432/codeforge_dev";

let adminPool: pg.Pool;
let orgA: string, orgB: string, candA: string, candB: string, candC: string;
let sessionA: string, sessionB: string, questionA1: string;

async function asService<T>(fn: (c: pg.PoolClient) => Promise<T>, orgId: string, actorRole = "SYSTEM", candidateId?: string): Promise<T> {
  const pool = new pg.Pool({ connectionString: CONN_SVC });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET ROLE app_service");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    await client.query("SELECT set_config('app.actor_role', $1, true)", [actorRole]);
    if (candidateId) await client.query("SELECT set_config('app.candidate_id', $1, true)", [candidateId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } finally {
    client.release();
    await pool.end();
  }
}

async function asAuthenticated<T>(fn: (c: pg.PoolClient) => Promise<T>, orgId: string, candidateId: string, actorRole: "CANDIDATE" | "STAFF"): Promise<T> {
  const pool = new pg.Pool({ connectionString: CONN_AUTH });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    await client.query("SELECT set_config('app.candidate_id', $1, true)", [candidateId]);
    await client.query("SELECT set_config('app.actor_role', $1, true)", [actorRole]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } finally {
    client.release();
    await pool.end();
  }
}

describe("§56-57/§66 live Postgres RLS + SECURITY DEFINER security tests", () => {
  before(async () => {
    adminPool = new pg.Pool({ connectionString: CONN });
    orgA = randomUUID();
    orgB = randomUUID();
    candA = randomUUID();
    candB = randomUUID();
    candC = randomUUID(); // second candidate, SAME org as A — for cross-candidate-same-org tests

    const bpA = await asService(async (c) => {
      const { rows } = await c.query(
        `SELECT (fn_create_blueprint($1,1,'Backend Engineer','PROJECT_DEFENSE','ADAPTIVE','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,$2)).id AS id`,
        [randomUUID(), candA]
      );
      return rows[0].id as string;
    }, orgA);
    sessionA = await asService(async (c) => {
      const { rows } = await c.query(`SELECT (fn_create_session($1,$2)).id AS id`, [bpA, candA]);
      return rows[0].id as string;
    }, orgA);
    questionA1 = await asService(async (c) => {
      const { rows } = await c.query(
        `SELECT (fn_record_question($1,1,'CONCEPTUAL','SQL','EASY','DEFINITION','What is a JOIN?',NULL,NULL,'BANK',NULL,NULL)).id AS id`,
        [sessionA]
      );
      return rows[0].id as string;
    }, orgA);

    const bpB = await asService(async (c) => {
      const { rows } = await c.query(
        `SELECT (fn_create_blueprint($1,1,'Backend Engineer','PROJECT_DEFENSE','ADAPTIVE','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,$2)).id AS id`,
        [randomUUID(), candB]
      );
      return rows[0].id as string;
    }, orgB);
    sessionB = await asService(async (c) => {
      const { rows } = await c.query(`SELECT (fn_create_session($1,$2)).id AS id`, [bpB, candB]);
      return rows[0].id as string;
    }, orgB);
  });

  after(async () => {
    await adminPool.end();
  });

  test("a candidate sees only their own org's sessions, never another org's", async () => {
    const rows = await asAuthenticated(async (c) => (await c.query(`SELECT id FROM technical_interview_sessions`)).rows, orgA, candA, "CANDIDATE");
    const ids = rows.map((r: any) => r.id);
    assert.ok(ids.includes(sessionA));
    assert.ok(!ids.includes(sessionB));
  });

  test("§18 a candidate sees ZERO blueprints — staff-only, enforced by RLS not just by the API layer", async () => {
    const rows = await asAuthenticated(async (c) => (await c.query(`SELECT id FROM technical_interview_blueprints`)).rows, orgA, candA, "CANDIDATE");
    assert.equal(rows.length, 0);
  });

  test("§18 staff in the SAME org CAN see blueprints; still zero from the other org", async () => {
    const rows = await asAuthenticated(async (c) => (await c.query(`SELECT org_id FROM technical_interview_blueprints`)).rows, orgA, candA, "STAFF");
    assert.ok(rows.length >= 1);
    assert.ok(rows.every((r: any) => r.org_id === orgA));
  });

  test("a cross-org state transition attempt is rejected with 'not found', not a revealing 'forbidden'", async () => {
    await assert.rejects(
      asAuthenticated(async (c) => c.query(`SELECT fn_transition_session($1, 'READY')`, [sessionB]), orgA, candA, "CANDIDATE"),
      /not found/
    );
  });

  test("a candidate cannot submit a response into a DIFFERENT candidate's session in the SAME org", async () => {
    await assert.rejects(
      asAuthenticated(
        async (c) => c.query(`SELECT fn_submit_response($1,$2,'not my session','hacker-key')`, [sessionA, questionA1]),
        orgA, candC, "CANDIDATE"
      ),
      /not the owner/
    );
  });

  test("§37 an illegal state transition (CREATED -> COMPLETED) is rejected at the database layer", async () => {
    await assert.rejects(
      asAuthenticated(async (c) => c.query(`SELECT fn_transition_session($1, 'COMPLETED')`, [sessionA]), orgA, candA, "CANDIDATE"),
      /illegal session transition/
    );
  });

  test("§37 a legal transition chain (CREATED -> READY -> IN_PROGRESS) succeeds", async () => {
    const finalState = await asAuthenticated(async (c) => {
      await c.query(`SELECT fn_transition_session($1, 'READY')`, [sessionA]);
      const { rows } = await c.query(`SELECT state FROM fn_transition_session($1, 'IN_PROGRESS')`, [sessionA]);
      return rows[0].state;
    }, orgA, candA, "CANDIDATE");
    assert.equal(finalState, "IN_PROGRESS");
  });

  test("§39 fn_submit_response is idempotent at the database layer: two calls with the same key produce exactly one row", async () => {
    const key = randomUUID();
    const [firstId, secondId] = await asAuthenticated(async (c) => {
      const r1 = await c.query(`SELECT (fn_submit_response($1,$2,'first text',$3)).id AS id`, [sessionA, questionA1, key]);
      const r2 = await c.query(`SELECT (fn_submit_response($1,$2,'a different retried text',$3)).id AS id`, [sessionA, questionA1, key]);
      return [r1.rows[0].id, r2.rows[0].id];
    }, orgA, candA, "CANDIDATE");
    assert.equal(firstId, secondId);

    const count = await asService(async (c) => {
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM technical_interview_responses WHERE session_id = $1 AND idempotency_key = $2`, [sessionA, key]);
      return rows[0].n;
    }, orgA);
    assert.equal(count, 1);
  });

  test("REGRESSION: querying as app_conn_service WITHOUT 'SET ROLE app_service' returns zero rows (BYPASSRLS is a role attribute, not inherited through membership) — guards against the exact failure class hit once already on the Skill Signal Engine", async () => {
    const pool = new pg.Pool({ connectionString: CONN_SVC });
    const client = await pool.connect();
    try {
      // deliberately NOT calling SET ROLE app_service here
      const { rows } = await client.query(`SELECT id FROM technical_interview_sessions WHERE id = $1`, [sessionA]);
      assert.equal(rows.length, 0, "app_conn_service alone (without SET ROLE app_service) must not see RLS-protected rows — if this starts failing, someone removed a required SET ROLE somewhere in the repository layer");
    } finally {
      client.release();
      await pool.end();
    }
  });
});
