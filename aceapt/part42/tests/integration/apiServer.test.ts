import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../../src/api/server.js";
import { createOwnerPool } from "../../db/client.js";

process.env.NODE_ENV = "test";
process.env.DIAG_APP_USER ??= "diag_app";
process.env.DIAG_APP_PASSWORD ??= "diag_app_dev_pw";
process.env.DIAG_DB_HOST ??= "127.0.0.1";
process.env.DIAG_DB_NAME ??= "aceapt_diagnostic";

const ownerPool = createOwnerPool();
const app = buildServer();

const tenantId = randomUUID();
const blueprintId = randomUUID();
const skillId = randomUUID();
const questionId = randomUUID();
const studentId = randomUUID();

beforeAll(async () => {
  await app.ready();
  await ownerPool.query("insert into diagnostic_blueprints (id, name, mode) values ($1,'API test blueprint','first_diagnostic')", [blueprintId]);
  const domainId = randomUUID();
  const topicId = randomUUID();
  const subtopicId = randomUUID();
  await ownerPool.query(
    `insert into diagnostic_blueprint_nodes (id, blueprint_id, parent_node_id, level, code, label, min_evidence_count) values
     ($1,$2,null,'domain','d','D',2), ($3,$2,$1,'topic','d.t','T',2), ($4,$2,$3,'subtopic','d.t.s','S',2), ($5,$2,$4,'skill','d.t.s.k','K',2)`,
    [domainId, blueprintId, topicId, subtopicId, skillId],
  );
  await ownerPool.query("insert into _fixture_students (id, tenant_id, display_name) values ($1,$2,'API Test Student')", [studentId, tenantId]);
  await ownerPool.query(
    "insert into _fixture_questions (id, domain, topic, subtopic, skill_node_id, difficulty, expected_time_ms, question_type) values ($1,'quant','arithmetic','percentage',$2,'medium',30000,'mcq')",
    [questionId, skillId],
  );
});

afterAll(async () => {
  const client = await ownerPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("select set_config('app.current_student_id',$1,true), set_config('app.current_tenant_id',$2,true)", [studentId, tenantId]);
    await client.query("delete from diagnostic_sessions where blueprint_id = $1", [blueprintId]);
    await client.query("delete from diagnostic_question_exposures where question_id = $1", [questionId]);
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  await ownerPool.query("delete from _fixture_questions where id = $1", [questionId]);
  await ownerPool.query("delete from diagnostic_blueprints where id = $1", [blueprintId]);
  await ownerPool.query("delete from _fixture_students where id = $1", [studentId]);
  await ownerPool.end();
  await app.close();
});

describe("API layer — real HTTP-shaped requests against the real Fastify app", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({ method: "POST", url: "/diagnostics/start", payload: { blueprintId, mode: "first_diagnostic" } });
    expect(res.statusCode).toBe(401);
  });

  it("full flow: start -> next -> submit -> complete -> result, over real HTTP-shaped calls", async () => {
    const headers = { "x-dev-student-id": studentId, "x-dev-tenant-id": tenantId };

    const startRes = await app.inject({ method: "POST", url: "/diagnostics/start", headers, payload: { blueprintId, mode: "first_diagnostic" } });
    expect(startRes.statusCode).toBe(200);
    const { session } = JSON.parse(startRes.body);

    const nextRes = await app.inject({ method: "GET", url: `/diagnostics/${session.id}/next`, headers });
    expect(nextRes.statusCode).toBe(200);
    const next = JSON.parse(nextRes.body);
    expect(next.done).toBe(false);
    expect(next.question.id).toBe(questionId);

    const submitRes = await app.inject({
      method: "POST",
      url: `/diagnostics/${session.id}/responses`,
      headers,
      payload: {
        clientResponseId: "api-resp-1",
        questionId,
        skillNodeId: skillId,
        answer: "A",
        isCorrect: true,
        questionDifficulty: "medium",
        expectedDurationMs: 30000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 27000,
        confidence: 4,
        hintUsed: false,
        attemptNumber: 1,
        wasPreviouslyExposed: false,
      },
    });
    expect(submitRes.statusCode).toBe(200);

    const completeRes = await app.inject({ method: "POST", url: `/diagnostics/${session.id}/complete`, headers });
    expect(completeRes.statusCode).toBe(200);

    const resultRes = await app.inject({ method: "GET", url: `/diagnostics/${session.id}/result`, headers });
    expect(resultRes.statusCode).toBe(200);
    const profile = JSON.parse(resultRes.body);
    expect(profile.skillProfiles.some((s: any) => s.skillNodeId === skillId)).toBe(true);
  });

  it("rejects a malformed response payload with 400, not a 500", async () => {
    const headers = { "x-dev-student-id": studentId, "x-dev-tenant-id": tenantId };
    const startRes = await app.inject({ method: "POST", url: "/diagnostics/start", headers, payload: { blueprintId, mode: "topic_diagnostic" } });
    const { session } = JSON.parse(startRes.body);

    const badRes = await app.inject({
      method: "POST",
      url: `/diagnostics/${session.id}/responses`,
      headers,
      payload: { clientResponseId: "x" }, // missing everything else
    });
    expect(badRes.statusCode).toBe(400);
  });
});
