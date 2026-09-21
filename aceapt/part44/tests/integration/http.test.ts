import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import pg from "pg";
import { buildApp } from "../../src/server.js";
import { closePool } from "../../src/db/pool.js";

async function json(res: Response): Promise<any> {
  return res.json();
}

describe("HTTP API (end-to-end through the real Express app)", () => {
  let server: Server;
  let baseUrl: string;
  let admin: pg.Client;
  let studentA: string;
  let studentB: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
    await admin.connect();
    const a = await admin.query("INSERT INTO students (display_name) VALUES ('HTTP Test Student A') RETURNING id");
    const b = await admin.query("INSERT INTO students (display_name) VALUES ('HTTP Test Student B') RETURNING id");
    studentA = a.rows[0].id;
    studentB = b.rows[0].id;
    await admin.query(
      `INSERT INTO mock_capability_snapshots (student_id, quant, logical, verbal, accuracy, speed_band, consistency, improvement_rate_per_hour)
       VALUES ($1, 72, 54, 68, 71, 'DEVELOPING', 58, $2::jsonb)`,
      [studentA, JSON.stringify({ quant: 1.1, logical: 2.4, verbal: 0.9 })]
    );

    const app = buildApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await admin.query("DELETE FROM students WHERE id = ANY($1)", [[studentA, studentB]]);
    await admin.end();
    await closePool();
  });

  function authed(studentId: string, init: RequestInit = {}) {
    return {
      ...init,
      headers: { "content-type": "application/json", "x-student-id": studentId, ...(init.headers ?? {}) },
    };
  }

  it("rejects requests with no student identity (dev-mode auth still enforced)", async () => {
    const res = await fetch(`${baseUrl}/api/goals`, { headers: { "content-type": "application/json" } });
    expect(res.status).toBe(401);
  });

  it("validates the request body and returns 400 on a malformed create", async () => {
    const res = await fetch(
      `${baseUrl}/api/goals`,
      authed(studentA, { method: "POST", body: JSON.stringify({ goalType: "NOT_A_REAL_TYPE", deadlineType: "NONE", availableTime: {} }) })
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("validation_failed");
  });

  it("creates a goal end-to-end over HTTP and computes real gap/priority", async () => {
    const res = await fetch(
      `${baseUrl}/api/goals`,
      authed(studentA, {
        method: "POST",
        body: JSON.stringify({
          goalType: "PLACEMENT_READINESS",
          deadlineType: "DAYS_FROM_NOW",
          deadlineDays: 30,
          availableTime: { monday: 30, wednesday: 30, friday: 30 },
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.goal.status).toBe("ACTIVE");
    expect(body.goal.prioritySnapshot[0].target).toBe("logical");
    expect(body.milestones).toHaveLength(5);
  });

  it("returns 404 (not another student's data) when Student B requests Student A's goal", async () => {
    const created = await fetch(
      `${baseUrl}/api/goals`,
      authed(studentA, {
        method: "POST",
        body: JSON.stringify({ goalType: "OVERALL_APTITUDE", deadlineType: "NONE", availableTime: {} }),
      })
    ).then((r) => json(r));

    const asOwner = await fetch(`${baseUrl}/api/goals/${created.goal.id}`, authed(studentA));
    expect(asOwner.status).toBe(200);

    const asOther = await fetch(`${baseUrl}/api/goals/${created.goal.id}`, authed(studentB));
    expect(asOther.status).toBe(404);
  });

  it("serves a goal explanation with a deterministic reason even with no AI configured", async () => {
    const created = await fetch(
      `${baseUrl}/api/goals`,
      authed(studentA, {
        method: "POST",
        body: JSON.stringify({ goalType: "SKILL_IMPROVEMENT", deadlineType: "NONE", availableTime: {}, focusDimension: "logical" }),
      })
    ).then((r) => json(r));

    const res = await fetch(`${baseUrl}/api/goals/${created.goal.id}/explanation`, authed(studentA));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.source).toBe("DETERMINISTIC"); // no ANTHROPIC_API_KEY in this test env
    expect(typeof body.explanation).toBe("string");
    expect(body.explanation.length).toBeGreaterThan(0);
  });

  it("pause -> resume over HTTP actually recalculates (Section 32)", async () => {
    const created = await fetch(
      `${baseUrl}/api/goals`,
      authed(studentA, {
        method: "POST",
        body: JSON.stringify({ goalType: "OVERALL_APTITUDE", deadlineType: "NONE", availableTime: {} }),
      })
    ).then((r) => json(r));
    const goalId = created.goal.id;

    const paused = await fetch(`${baseUrl}/api/goals/${goalId}/pause`, authed(studentA, { method: "POST" })).then((r) => json(r));
    expect(paused.goal.status).toBe("PAUSED");

    const resumed = await fetch(`${baseUrl}/api/goals/${goalId}/resume`, authed(studentA, { method: "POST" })).then((r) => json(r));
    expect(resumed.goal.status).toBe("ACTIVE");

    const snapshots = await fetch(`${baseUrl}/api/goals/${goalId}/snapshots`, authed(studentA)).then((r) => json(r));
    expect(snapshots.snapshots.at(-1).trigger).toBe("RECALCULATED");
  });

  it("the learning/planner/readiness handoff endpoints return the documented shapes (Sections 41-43)", async () => {
    const created = await fetch(
      `${baseUrl}/api/goals`,
      authed(studentA, {
        method: "POST",
        body: JSON.stringify({ goalType: "PLACEMENT_READINESS", deadlineType: "DAYS_FROM_NOW", deadlineDays: 14, availableTime: { monday: 20 } }),
      })
    ).then((r) => json(r));
    const goalId = created.goal.id;

    const learning = await fetch(`${baseUrl}/api/goals/${goalId}/handoff/learning`, authed(studentA)).then((r) => json(r));
    expect(learning).toHaveProperty("goal_id", goalId);
    expect(learning).toHaveProperty("priority_skills");
    expect(learning).toHaveProperty("reason");

    const planner = await fetch(`${baseUrl}/api/goals/${goalId}/handoff/planner`, authed(studentA)).then((r) => json(r));
    expect(planner).toHaveProperty("milestones");
    expect(planner.milestones).toHaveLength(5);

    const readiness = await fetch(`${baseUrl}/api/goals/${goalId}/handoff/readiness`, authed(studentA)).then((r) => json(r));
    expect(readiness).toHaveProperty("goal_health");
    expect(readiness).toHaveProperty("evidence_quality");
  });

  it("goal extraction endpoint returns a draft, not something already persisted (Section 13)", async () => {
    const res = await fetch(
      `${baseUrl}/api/goals/extract`,
      authed(studentA, {
        method: "POST",
        body: JSON.stringify({ text: "I have a placement test in 20 days and logical reasoning is my weakest area." }),
      })
    );
    expect(res.status).toBe(200);
    const draft = await json(res);
    expect(draft.goalType).toBe("PLACEMENT_READINESS");
    expect(draft.deadlineDays).toBe(20);
    expect(draft.source).toBe("FALLBACK"); // no ANTHROPIC_API_KEY in this test env
  });
});
