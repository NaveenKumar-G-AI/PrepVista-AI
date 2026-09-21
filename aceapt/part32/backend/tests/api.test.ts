import { beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Express } from "express";

// Point the repository at a throwaway file BEFORE the app is built, so
// this test suite never touches the real dev/seed database.
let app: Express;

beforeAll(async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "readiness-radar-test-"));
  process.env.READINESS_DB_PATH = path.join(tmpDir, "db.json");
  const { buildApp } = await import("../src/app.js");
  app = buildApp(process.env);
});

function freshStudentId(): string {
  return `test-student-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("GET /api/readiness-radar/roles", () => {
  it("returns reference role data without requiring auth", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/readiness-radar/roles");
    expect(res.status).toBe(200);
    expect(res.body.roles.length).toBeGreaterThan(0);
    expect(res.body.roles[0]).toHaveProperty("roleId");
  });
});

describe("auth stub", () => {
  it("rejects requests with no x-student-id header", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/readiness-radar/state");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("full readiness journey for a new student", () => {
  it("walks NO_TARGET_ROLE -> INSUFFICIENT_DATA -> READY, evidence-driven throughout", async () => {
    const { default: request } = await import("supertest");
    const studentId = freshStudentId();
    const headers = { "x-student-id": studentId };

    const initial = await request(app).get("/api/readiness-radar/state").set(headers);
    expect(initial.status).toBe(200);
    expect(initial.body.status).toBe("NO_TARGET_ROLE");

    const afterRole = await request(app)
      .post("/api/readiness-radar/target-role")
      .set(headers)
      .send({ roleId: "swe_entry" });
    expect(afterRole.status).toBe(200);
    expect(afterRole.body.status).toBe("INSUFFICIENT_DATA");

    const badScore = await request(app)
      .post("/api/readiness-radar/assessment-attempts")
      .set(headers)
      .send({ capabilityId: "dsa", score: 150 });
    expect(badScore.status).toBe(400);
    expect(badScore.body.error.code).toBe("VALIDATION_ERROR");

    const afterAttempt = await request(app)
      .post("/api/readiness-radar/assessment-attempts")
      .set(headers)
      .send({ capabilityId: "dsa", score: 45 });
    expect(afterAttempt.status).toBe(201);
    expect(afterAttempt.body.status).toBe("READY");

    const dsaGap = afterAttempt.body.gaps.find((g: { capabilityId: string }) => g.capabilityId === "dsa");
    expect(dsaGap.currentScore).toBe(45);
    // One recent attempt is real evidence (not "insufficient"), but HIGH
    // confidence requires >=3 attempts — this should land on MEDIUM.
    expect(dsaGap.confidence).toBe("MEDIUM");

    // Note: the DO_FIRST slot isn't guaranteed to be "dsa" — an entirely
    // unassessed, high-weight capability can outrank a measured-but-modest
    // gap (see recommendation.service.ts). Assert against whichever
    // capability actually comes back, rather than assuming which one.
    const topRecommendation = afterAttempt.body.recommendations.doFirst[0];
    expect(topRecommendation?.id).toBeTruthy();
    const targetCapabilityId: string = topRecommendation.capabilityId;

    const completed = await request(app)
      .post(`/api/readiness-radar/recommendations/${topRecommendation.id}/complete`)
      .set(headers)
      .send({ resultScore: 95 });
    expect(completed.status).toBe(200);

    const events = await request(app).get("/api/readiness-radar/events").set(headers);
    expect(events.status).toBe(200);
    const types = events.body.events.map((e: { type: string }) => e.type);
    expect(types).toContain("ACTION_COMPLETED");
    expect(types).toContain("ASSESSMENT_COMPLETED");

    // A single strong practice result should genuinely move the capability
    // that was actually practiced, but should not instantly grant it full
    // (HIGH) confidence — mastery requires a sustained pattern, per spec
    // section 13, not one data point.
    const after = await request(app).get("/api/readiness-radar/state").set(headers);
    const practicedGap = after.body.gaps.find((g: { capabilityId: string }) => g.capabilityId === targetCapabilityId);
    expect(practicedGap.onTrack).toBe(true); // 95 clears every bar in this rubric
    expect(practicedGap.confidence).not.toBe("HIGH"); // still only 1-2 attempts total
  });

  it("returns 404 for a recommendation id that doesn't map to a known capability", async () => {
    const { default: request } = await import("supertest");
    const studentId = freshStudentId();
    const headers = { "x-student-id": studentId };
    await request(app).post("/api/readiness-radar/target-role").set(headers).send({ roleId: "swe_entry" });

    const res = await request(app)
      .post("/api/readiness-radar/recommendations/not_a_real_id__NOPE/complete")
      .set(headers)
      .send({});
    expect(res.status).toBe(404);
  });
});
