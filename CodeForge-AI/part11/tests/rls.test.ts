import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { testPool, closeTestPool, createTestUser, asAuthenticatedUser } from "./dbHelpers";

describe("Row Level Security (brief: 'student must not see hidden ground truth' / 'student isolation')", () => {
  let db: Pool;
  let alice: string;
  let bob: string;
  let templateId: string;
  let aliceIncidentId: string;

  beforeAll(async () => {
    db = testPool();
    alice = await createTestUser(db);
    bob = await createTestUser(db);
    const t = await db.query("select id from incident_templates where slug = 'pf-2048'");
    templateId = t.rows[0].id;
    const inc = await db.query(
      "insert into incidents (template_id, owner_id, code, state) values ($1,$2,'PF-9001','CREATED') returning id",
      [templateId, alice]
    );
    aliceIncidentId = inc.rows[0].id;
  });

  afterAll(async () => {
    await db.query("delete from incidents where id = $1", [aliceIncidentId]);
    await db.query("delete from auth.users where id in ($1,$2)", [alice, bob]);
    await closeTestPool();
  });

  it("the authenticated role cannot read hidden ground truth from the base catalog table at all", async () => {
    await expect(
      asAuthenticatedUser(db, alice, async (client) => {
        await client.query("select root_cause_key from incident_templates limit 1");
      })
    ).rejects.toThrow(/permission denied/i);
  });

  it("the public view exposes safe fields and has no hidden columns to leak", async () => {
    const rows = await asAuthenticatedUser(db, alice, async (client) => {
      const res = await client.query("select * from incident_template_public where id = $1", [templateId]);
      return res.rows;
    });
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("root_cause_key");
    expect(Object.keys(rows[0])).not.toContain("scoring_rubric");
  });

  it("the public action-defs view hides validity/is_mitigation/consequence", async () => {
    const rows = await asAuthenticatedUser(db, alice, async (client) => {
      const res = await client.query(
        "select * from incident_action_defs_public where template_id = $1 and action_type = 'ROLLBACK'",
        [templateId]
      );
      return res.rows;
    });
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("validity");
    expect(Object.keys(rows[0])).not.toContain("is_mitigation");
    expect(Object.keys(rows[0])).not.toContain("consequence");
    expect(rows[0].risk).toBe("DANGEROUS"); // risk level itself IS safe to show
  });

  it("the log-lines table has no hidden per-line flag — a line's own id is already safe to reveal", async () => {
    const rows = await asAuthenticatedUser(db, alice, async (client) => {
      const res = await client.query("select * from incident_log_lines where template_id = $1 limit 5", [templateId]);
      return res.rows;
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Object.keys(r)).not.toContain("evidence_key");
    }
  });

  it("expectedEvidenceKeys (which log/trace ids actually matter) never appears on the public template view", async () => {
    const rows = await asAuthenticatedUser(db, alice, async (client) => {
      const res = await client.query("select * from incident_template_public where id = $1", [templateId]);
      return res.rows;
    });
    expect(Object.keys(rows[0])).not.toContain("expected_evidence_keys");
  });

  it("brief CRITICAL TEST CASE: student B cannot see student A's incident", async () => {
    const bobsView = await asAuthenticatedUser(db, bob, async (client) => {
      const res = await client.query("select id from incidents where id = $1", [aliceIncidentId]);
      return res.rows;
    });
    expect(bobsView).toHaveLength(0);

    const alicesView = await asAuthenticatedUser(db, alice, async (client) => {
      const res = await client.query("select id from incidents where id = $1", [aliceIncidentId]);
      return res.rows;
    });
    expect(alicesView).toHaveLength(1);
  });

  it("student B cannot forge a write into student A's incident, even naming A as the actor", async () => {
    await expect(
      asAuthenticatedUser(db, bob, async (client) => {
        await client.query(
          "insert into incident_events (incident_id, actor_id, event_type, payload, sim_minutes_at) values ($1,$2,'INSPECT_LOGS','{}',0)",
          [aliceIncidentId, alice]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it("an unauthenticated (anon) role has no grant on instance tables at all", async () => {
    await expect(
      asAuthenticatedUser(db, null, async (client) => {
        await client.query("SET LOCAL ROLE anon");
        await client.query("select id from incidents");
      })
    ).rejects.toThrow(/permission denied/i);
  });
});
