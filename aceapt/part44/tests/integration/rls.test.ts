import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { closePool, getPool, withStudentContext } from "../../src/db/pool.js";

// Requires a live Postgres reachable via DATABASE_URL/MIGRATION_DATABASE_URL
// with migrations already applied (see README "Running the tests"). This
// directly implements Section 64 of the Feature 44 spec: "Explicitly
// test: Student A -> Student B goal. Expected: 403 / not found according
// to existing security convention."
//
// Creates its own dedicated student fixtures (rather than reusing the
// shared db/seed.ts demo students) so this file can never interfere
// with other integration test files touching the same tables.
describe("Row Level Security cross-tenant isolation (Section 53, 64)", () => {
  let admin: pg.Client;
  let studentA: string;
  let studentB: string;
  let goalId: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
    await admin.connect();
    const a = await admin.query(
      "INSERT INTO students (display_name) VALUES ('RLS Test Student A') RETURNING id"
    );
    const b = await admin.query(
      "INSERT INTO students (display_name) VALUES ('RLS Test Student B') RETURNING id"
    );
    studentA = a.rows[0].id;
    studentB = b.rows[0].id;
  });

  afterAll(async () => {
    // ON DELETE CASCADE takes goals/milestones/snapshots/history with it.
    await admin.query("DELETE FROM students WHERE id = ANY($1)", [[studentA, studentB]]);
    await admin.end();
    await closePool();
  });

  it("lets a student create and read their own goal", async () => {
    const created = await withStudentContext(studentA, async (client) => {
      const res = await client.query(
        `INSERT INTO goals (student_id, goal_type, title, deadline_type)
         VALUES ($1, 'PLACEMENT_READINESS', 'Placement readiness', 'DAYS_FROM_NOW')
         RETURNING id`,
        [studentA]
      );
      return res.rows[0].id as string;
    });
    goalId = created;

    const readBack = await withStudentContext(studentA, async (client) => {
      const res = await client.query("SELECT id FROM goals WHERE id = $1", [goalId]);
      return res.rows;
    });
    expect(readBack).toHaveLength(1);
  });

  it("returns zero rows when a different student queries for it (never a 500, never leaks the row)", async () => {
    const rows = await withStudentContext(studentB, async (client) => {
      const res = await client.query("SELECT id FROM goals WHERE id = $1", [goalId]);
      return res.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("blocks a different student's UPDATE too, not just SELECT", async () => {
    const result = await withStudentContext(studentB, async (client) => {
      return client.query("UPDATE goals SET title = 'hijacked' WHERE id = $1", [goalId]);
    });
    expect(result.rowCount).toBe(0);
  });

  it("cannot be tricked into writing a row under another student's id via WITH CHECK", async () => {
    // Session is scoped to studentA, but the row being inserted claims
    // to belong to studentB - the WITH CHECK clause must reject this.
    await expect(
      withStudentContext(studentA, async (client) => {
        await client.query(
          `INSERT INTO goals (student_id, goal_type, title, deadline_type)
           VALUES ($1, 'CUSTOM', 'spoofed', 'NONE')`,
          [studentB]
        );
      })
    ).rejects.toThrow();
  });

  it("fails closed (zero rows) when no session variable is set at all, not open by default", async () => {
    const client = await getPool().connect();
    try {
      const res = await client.query("SELECT count(*)::int AS n FROM goals WHERE id = $1", [goalId]);
      expect(res.rows[0].n).toBe(0);
    } finally {
      client.release();
    }
  });

  it("isolates the child tables (milestones/snapshots/history) via the same policy pattern", async () => {
    await withStudentContext(studentA, async (client) => {
      await client.query(
        `INSERT INTO goal_milestones (goal_id, title, sequence, evidence_required)
         VALUES ($1, 'Foundation', 1, 'baseline capability recorded')`,
        [goalId]
      );
    });
    const asB = await withStudentContext(studentB, async (client) => {
      const res = await client.query("SELECT id FROM goal_milestones WHERE goal_id = $1", [goalId]);
      return res.rows;
    });
    expect(asB).toHaveLength(0);
  });
});
