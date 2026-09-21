import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { buildContainer } from "../../src/orchestration/container.js";
import { buildInterviewRouter } from "../../src/api/routes/interviews.js";
import { actorMiddleware } from "../../src/api/middleware/actor.js";
import { errorHandler } from "../../src/api/middleware/errorHandler.js";
import { EXAMPLE_ORG_ID, EXAMPLE_ROLE_ID, EXAMPLE_STUDENT_ID } from "../../src/integration/adapters/fixtures.js";

function buildTestApp() {
  const container = buildContainer();
  const app = express();
  app.use(express.json());
  app.use(actorMiddleware());
  app.use("/api", buildInterviewRouter(container));
  app.use(errorHandler());
  return { app, container };
}

const studentHeaders = {
  "x-actor-user-id": "u_ada",
  "x-actor-org-id": EXAMPLE_ORG_ID,
  "x-actor-roles": "STUDENT",
  "x-actor-student-id": EXAMPLE_STUDENT_ID,
};

const trainerHeaders = {
  "x-actor-user-id": "u_trainer",
  "x-actor-org-id": EXAMPLE_ORG_ID,
  "x-actor-roles": "TRAINER",
};

describe("technical interview API — happy path", () => {
  it("creates, starts, answers, and completes an interview end to end", async () => {
    const { app } = buildTestApp();

    const createRes = await request(app)
      .post("/api/interviews")
      .set(studentHeaders)
      .send({ studentId: EXAMPLE_STUDENT_ID, roleId: EXAMPLE_ROLE_ID, mode: "PROJECT_DEFENSE" });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.session.id;
    expect(createRes.body.session.state).toBe("CREATED");
    // Student-facing session view must not leak internal coverage/versionInfo.
    expect(createRes.body.session.coverage).toBeUndefined();

    const startRes = await request(app).post(`/api/interviews/sessions/${sessionId}/start`).set(studentHeaders).send();
    expect(startRes.status).toBe(200);
    expect(startRes.body.session.state).toBe("IN_PROGRESS");

    let questionId: string | undefined;
    let guard = 0;
    while (guard++ < 30) {
      const nextRes = await request(app).get(`/api/interviews/sessions/${sessionId}/next-question`).set(studentHeaders);
      expect(nextRes.status).toBeLessThan(500);

      if (nextRes.body.status === "READY_TO_COMPLETE") break;
      expect(nextRes.body.status).toBe("QUESTION_READY");
      questionId = nextRes.body.question.id;
      expect(nextRes.body.question.text.length).toBeGreaterThan(0);
      // Student view of a question must never include difficulty/grounding internals.
      expect(nextRes.body.question.difficulty).toBeUndefined();
      expect(nextRes.body.question.groundedIn).toBeUndefined();

      const submitRes = await request(app)
        .post(`/api/interviews/sessions/${sessionId}/responses`)
        .set(studentHeaders)
        .send({
          questionId,
          content:
            "Because repeated per-row queries create an N+1 pattern, I would batch-load the related tags in a single query instead, which trades a bit of memory for far fewer round trips to the database.",
          modality: "TEXT",
          idempotencyKey: `key-${questionId}-${guard}`,
        });
      expect(submitRes.status).toBe(201);
      // Student view of a submitted response must never include correctness/confidence/adaptiveSignal.
      expect(submitRes.body.evaluation.confidence).toBeUndefined();
      expect(submitRes.body.evaluation.adaptiveSignal).toBeUndefined();
      expect(submitRes.body.evaluation.status).toBeDefined();
    }
    expect(guard).toBeLessThan(30); // sanity: the loop must actually terminate

    const completeRes = await request(app).post(`/api/interviews/sessions/${sessionId}/complete`).set(studentHeaders).send();
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.session.state).toBe("COMPLETED");
    expect(completeRes.body.summary.sessionId).toBe(sessionId);
    expect(Array.isArray(completeRes.body.summary.verifiedSkills)).toBe(true);

    // The read-only summary endpoint must also work post-completion — and
    // not error the way re-calling /complete would (session is no longer IN_PROGRESS).
    const summaryRes = await request(app).get(`/api/interviews/sessions/${sessionId}/summary`).set(studentHeaders);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.summary.sessionId).toBe(sessionId);
    expect(summaryRes.body.summary.assessmentComplete).toBe(completeRes.body.summary.assessmentComplete);

    // Trainer can see full evaluation detail after the fact.
    const evalRes = await request(app).get(`/api/interviews/sessions/${sessionId}/evaluations`).set(trainerHeaders);
    expect(evalRes.status).toBe(200);
    expect(evalRes.body.evaluations.length).toBeGreaterThan(0);
    expect(evalRes.body.evaluations[0]).toHaveProperty("confidence");

    const evidenceRes = await request(app).get(`/api/interviews/sessions/${sessionId}/skill-evidence`).set(trainerHeaders);
    expect(evidenceRes.status).toBe(200);
    expect(evidenceRes.body.skillEvidence.length).toBeGreaterThan(0);
  });

  it("rejects requests with no actor headers", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/api/interviews/sessions/nonexistent`);
    expect(res.status).toBe(401);
  });

  it("rejects an invalid create-interview body", async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post("/api/interviews")
      .set(studentHeaders)
      .send({ studentId: EXAMPLE_STUDENT_ID, roleId: EXAMPLE_ROLE_ID, mode: "NOT_A_REAL_MODE" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
  });
});

describe("technical interview API — tenant isolation (Phase 60, 69)", () => {
  it("returns 404, not data, for a session in a different org", async () => {
    const { app } = buildTestApp();
    const createRes = await request(app)
      .post("/api/interviews")
      .set(studentHeaders)
      .send({ studentId: EXAMPLE_STUDENT_ID, roleId: EXAMPLE_ROLE_ID, mode: "TECHNICAL_SCREENING" });
    const sessionId = createRes.body.session.id;

    const crossOrgHeaders = { "x-actor-user-id": "intruder", "x-actor-org-id": "org_other_college", "x-actor-roles": "STUDENT", "x-actor-student-id": "student_intruder" };
    const res = await request(app).get(`/api/interviews/sessions/${sessionId}`).set(crossOrgHeaders);
    expect(res.status).toBe(404);
  });

  it("returns 403 when one student tries to respond to another student's session", async () => {
    const { app } = buildTestApp();
    const createRes = await request(app)
      .post("/api/interviews")
      .set(studentHeaders)
      .send({ studentId: EXAMPLE_STUDENT_ID, roleId: EXAMPLE_ROLE_ID, mode: "TECHNICAL_SCREENING" });
    const sessionId = createRes.body.session.id;
    await request(app).post(`/api/interviews/sessions/${sessionId}/start`).set(studentHeaders).send();
    const nextRes = await request(app).get(`/api/interviews/sessions/${sessionId}/next-question`).set(studentHeaders);
    const questionId = nextRes.body.question.id;

    const otherStudentHeaders = { "x-actor-user-id": "u_other", "x-actor-org-id": EXAMPLE_ORG_ID, "x-actor-roles": "STUDENT", "x-actor-student-id": "student_other" };
    const res = await request(app)
      .post(`/api/interviews/sessions/${sessionId}/responses`)
      .set(otherStudentHeaders)
      .send({ questionId, content: "not my interview", modality: "TEXT", idempotencyKey: "intrude-1" });
    expect(res.status).toBe(403);
  });

  it("blocks a STUDENT from viewing institutional reports", async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(`/api/interviews/institutional-report`)
      .query({ roleId: EXAMPLE_ROLE_ID, studentIds: EXAMPLE_STUDENT_ID })
      .set(studentHeaders);
    expect(res.status).toBe(403);
  });
});
