import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { closePool, getPool, withStudentContext } from "../../src/db/pool.js";
import { GoalService } from "../../src/services/goalService.js";
import { MockCapabilityDataClient } from "../../src/integrations/capability/MockCapabilityDataClient.js";
import { NoopAnalyticsSink } from "../../src/analytics/events.js";
import { milestoneRepository } from "../../src/repositories/milestoneRepository.js";

// Creates its own dedicated student fixtures (rather than reusing the
// shared db/seed.ts demo students) so this file can run in any order,
// and any number of times, without interfering with other integration
// test files that touch the same tables.
describe("GoalService (live Postgres integration)", () => {
  let studentA: string;
  let studentB: string;
  let service: GoalService;
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
    await admin.connect();

    const a = await admin.query(
      "INSERT INTO students (display_name) VALUES ('GoalService Test Student A') RETURNING id"
    );
    const b = await admin.query(
      "INSERT INTO students (display_name) VALUES ('GoalService Test Student B') RETURNING id"
    );
    studentA = a.rows[0].id;
    studentB = b.rows[0].id;

    // Student A: matches the Feature 44 spec's own worked example
    // (Section 71) - Quant 72 / Logical 54 / Verbal 68 - so Logical is
    // clearly the largest gap against the broad-readiness benchmark.
    await admin.query(
      `INSERT INTO mock_capability_snapshots
        (student_id, quant, logical, verbal, probability, data_interpretation, accuracy, speed_band, consistency, improvement_rate_per_hour)
       VALUES ($1, 72, 54, 68, 49, 61, 71, 'DEVELOPING', 58, $2::jsonb)`,
      [studentA, JSON.stringify({ quant: 1.1, logical: 2.4, verbal: 0.9, probability: 2.1, data_interpretation: 1.4 })]
    );

    // Student B: comfortably above every dimension of the
    // PLACEMENT_READINESS benchmark (75/75/75/70/70, accuracy 80,
    // ON_PACE) - a clean "already achieved" fixture for Section 34.
    await admin.query(
      `INSERT INTO mock_capability_snapshots
        (student_id, quant, logical, verbal, probability, data_interpretation, accuracy, speed_band, consistency, improvement_rate_per_hour)
       VALUES ($1, 81, 77, 78, 72, 73, 84, 'ON_PACE', 75, $2::jsonb)`,
      [studentB, JSON.stringify({ quant: 0.6, logical: 0.5, verbal: 0.4 })]
    );

    service = new GoalService(new MockCapabilityDataClient(getPool()), new NoopAnalyticsSink());
  });

  afterAll(async () => {
    await admin.query("DELETE FROM students WHERE id = ANY($1)", [[studentA, studentB]]);
    await admin.end();
    await closePool();
  });

  it("creates a PLACEMENT_READINESS goal, computes gap/priority against real seed data, and generates milestones", async () => {
    const view = await withStudentContext(studentA, (client) =>
      service.createGoal(client, studentA, {
        goalType: "PLACEMENT_READINESS",
        deadlineType: "DAYS_FROM_NOW",
        deadlineDays: 30,
        availableTime: { monday: 30, tuesday: 30, wednesday: 30, thursday: 30, friday: 30 },
      })
    );

    expect(view.goal.status).toBe("ACTIVE");
    expect(view.goal.targetDate).toBeTruthy();
    const topPriority = (view.goal.prioritySnapshot as any[])[0];
    expect(topPriority.target).toBe("logical");
    expect(view.milestones).toHaveLength(5);
    expect(view.milestones[0]?.status).toBe("ACTIVE");
    expect(view.milestones[0]?.title).toBe("Foundation");
    expect(view.alreadyAtOrAboveTarget).toBe(false);
  });

  it("already-at-target goals are reported honestly instead of forcing more learning (Section 34)", async () => {
    const view = await withStudentContext(studentB, (client) =>
      service.createGoal(client, studentB, {
        goalType: "PLACEMENT_READINESS",
        deadlineType: "NONE",
        availableTime: {},
      })
    );
    expect(view.alreadyAtOrAboveTarget).toBe(true);
  });

  it("shifts the top priority after a real capability improvement is recorded (Sections 28-29)", async () => {
    const goalId = await withStudentContext(studentA, async (client) => {
      const res = await client.query(
        "SELECT id FROM goals WHERE student_id = $1 ORDER BY created_at ASC LIMIT 1",
        [studentA]
      );
      return res.rows[0].id as string;
    });

    const before = await withStudentContext(studentA, (client) => service.getGoal(client, goalId));
    expect((before!.goal.prioritySnapshot as any[])[0].target).toBe("logical");

    // Simulate real new diagnostic evidence: logical jumps 54 -> 74,
    // closing that gap, while quant/verbal barely move.
    await admin.query(
      `INSERT INTO mock_capability_snapshots (student_id, quant, logical, verbal, accuracy, speed_band, consistency, improvement_rate_per_hour)
       VALUES ($1, 70, 74, 68, 74, 'DEVELOPING', 66, $2::jsonb)`,
      [studentA, JSON.stringify({ quant: 0.4, logical: 0.3, verbal: 2.5 })]
    );

    const after = await withStudentContext(studentA, (client) => service.recalculate(client, goalId));
    const newTop = (after.goal.prioritySnapshot as any[])[0].target;
    expect(newTop).not.toBe("logical");

    const history = await withStudentContext(studentA, async (client) => {
      const res = await client.query(
        "SELECT event_type, payload FROM goal_history_events WHERE goal_id = $1 ORDER BY created_at ASC",
        [goalId]
      );
      return res.rows;
    });
    expect(history.some((h) => h.event_type === "PRIORITY_CHANGED")).toBe(true);

    const snapshots = await withStudentContext(studentA, async (client) => {
      const res = await client.query("SELECT trigger FROM goal_snapshots WHERE goal_id = $1 ORDER BY captured_at ASC", [goalId]);
      return res.rows.map((r) => r.trigger);
    });
    expect(snapshots).toEqual(["CREATED", "RECALCULATED"]);
  });

  it("pause preserves history and status; resume reassesses rather than blindly restoring (Sections 31-32)", async () => {
    const goalId = await withStudentContext(studentB, async (client) => {
      const res = await client.query("SELECT id FROM goals WHERE student_id = $1 LIMIT 1", [studentB]);
      return res.rows[0].id as string;
    });

    const paused = await withStudentContext(studentB, (client) => service.pause(client, goalId));
    expect(paused.status).toBe("PAUSED");
    expect(paused.health).toBe("PAUSED");

    const resumed = await withStudentContext(studentB, (client) => service.resume(client, goalId));
    expect(resumed.goal.status).toBe("ACTIVE");
    const snapshotTriggers = await withStudentContext(studentB, async (client) => {
      const res = await client.query("SELECT trigger FROM goal_snapshots WHERE goal_id = $1 ORDER BY captured_at ASC", [goalId]);
      return res.rows.map((r) => r.trigger);
    });
    expect(snapshotTriggers.at(-1)).toBe("RECALCULATED");

    const history = await withStudentContext(studentB, async (client) => {
      const res = await client.query("SELECT event_type FROM goal_history_events WHERE goal_id = $1 ORDER BY created_at ASC", [goalId]);
      return res.rows.map((r) => r.event_type);
    });
    expect(history).toContain("PAUSED");
    expect(history).toContain("RESUMED");
  });

  it("never completes a goal on student-click alone - only once evidence (Verification milestone) exists (Section 33)", async () => {
    const goalId = await withStudentContext(studentA, async (client) => {
      const res = await client.query(
        "SELECT id FROM goals WHERE student_id = $1 ORDER BY created_at ASC LIMIT 1",
        [studentA]
      );
      return res.rows[0].id as string;
    });

    const attempt1 = await withStudentContext(studentA, (client) => service.markStudentComplete(client, goalId));
    expect(attempt1.verified).toBe(false);
    expect(attempt1.goal.status).toBe("ACTIVE");
    expect(attempt1.goal.studentMarkedComplete).toBe(true);

    await withStudentContext(studentA, async (client) => {
      const milestones = await milestoneRepository.listForGoal(client, goalId);
      for (const m of milestones) {
        await client.query("UPDATE goal_milestones SET status = 'ACHIEVED', completed_at = now() WHERE id = $1", [m.id]);
      }
    });

    const attempt2 = await withStudentContext(studentA, (client) => service.markStudentComplete(client, goalId));
    expect(attempt2.verified).toBe(true);
    expect(attempt2.goal.status).toBe("COMPLETED");
    expect(attempt2.goal.systemVerifiedComplete).toBe(true);
  });
});
