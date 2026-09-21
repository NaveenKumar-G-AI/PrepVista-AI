import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createAppPool, createOwnerPool } from "../../db/client.js";
import { PostgresDiagnosticRepository } from "../../src/repositories/postgresDiagnosticRepository.js";
import { PostgresQuestionBank } from "../../src/repositories/questionBank.js";
import { DiagnosticSessionService } from "../../src/engine/sessionManager.js";
import { deterministicMistakeIntelligence } from "../../src/engine/errorSignals.js";
import { deterministicExplanationProvider } from "../../src/ai/deterministicFallback.js";

const ownerPool = createOwnerPool();
const appPool = createAppPool();
const repo = new PostgresDiagnosticRepository(appPool);
const questionBank = new PostgresQuestionBank(appPool);
const service = new DiagnosticSessionService(repo, questionBank, deterministicMistakeIntelligence, deterministicExplanationProvider);

const tenantId = randomUUID();
const blueprintId = randomUUID();
const domainId = randomUUID();
const topicId = randomUUID();
const subtopicId = randomUUID();
const skillId = randomUUID();
const questionId = randomUUID();
const studentA = randomUUID();
const studentB = randomUUID();

beforeAll(async () => {
  await ownerPool.query("insert into diagnostic_blueprints (id, name, mode) values ($1, $2, $3)", [blueprintId, "Integration Test Blueprint", "first_diagnostic"]);
  await ownerPool.query(
    `insert into diagnostic_blueprint_nodes (id, blueprint_id, parent_node_id, level, code, label, min_evidence_count) values
     ($1, $2, null, 'domain', 'itq', 'Integration Test Domain', 4),
     ($3, $2, $1, 'topic', 'itq.t', 'Topic', 4),
     ($4, $2, $3, 'subtopic', 'itq.t.s', 'Subtopic', 4),
     ($5, $2, $4, 'skill', 'itq.t.s.k', 'Skill', 4)`,
    [domainId, blueprintId, topicId, subtopicId, skillId],
  );
  await ownerPool.query("insert into _fixture_students (id, tenant_id, display_name) values ($1, $2, 'A'), ($3, $2, 'B')", [studentA, tenantId, studentB]);
  await ownerPool.query(
    `insert into _fixture_questions (id, domain, topic, subtopic, skill_node_id, difficulty, expected_time_ms, question_type) values
     ($1, 'quant', 'arithmetic', 'percentage', $2, 'medium', 30000, 'mcq')`,
    [questionId, skillId],
  );
});

afterAll(async () => {
  // diagnostic_sessions is RLS-FORCED even for diag_owner (by design — see
  // TRUTH_TABLE.md) — a plain delete with no context set matches zero rows,
  // which is exactly what a first draft of this cleanup got wrong: it
  // "succeeded" silently while leaving every session in place, and the
  // blueprint delete below then failed on the FK. Scoping the context per
  // known test student, in an explicit transaction, is what fixes it.
  for (const studentId of [studentA, studentB]) {
    const client = await ownerPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("select set_config('app.current_student_id', $1, true), set_config('app.current_tenant_id', $2, true)", [studentId, tenantId]);
      await client.query("delete from diagnostic_sessions where blueprint_id = $1", [blueprintId]);
      await client.query("delete from diagnostic_question_exposures where question_id = $1", [questionId]);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  }
  await ownerPool.query("delete from _fixture_questions where id = $1", [questionId]);
  await ownerPool.query("delete from diagnostic_blueprints where id = $1", [blueprintId]); // cascades nodes
  await ownerPool.query("delete from _fixture_students where id in ($1, $2)", [studentA, studentB]);
  await ownerPool.end();
  await appPool.end();
});

describe("Real Postgres — end-to-end write path", () => {
  it("starts a session, submits a response, and reads it back through the app pool", async () => {
    const ctx = { tenantId, studentId: studentA };
    const { session } = await service.startOrResume(ctx, blueprintId, "first_diagnostic");
    expect(session.status).toBe("in_progress");

    const submit = await service.submitResponse(ctx, session.id, {
      clientResponseId: "int-resp-1",
      questionId,
      skillNodeId: skillId,
      answer: "A",
      isCorrect: true,
      questionDifficulty: "medium",
      expectedDurationMs: 30000,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 28000,
      confidence: 4,
      hintUsed: false,
      attemptNumber: 1,
      wasPreviouslyExposed: false,
    });
    expect(submit.ok).toBe(true);

    const estimates = await repo.getSkillEstimates(ctx, session.id);
    const skillEstimate = estimates.find((e) => e.skillNodeId === skillId);
    expect(skillEstimate?.evidenceCount).toBe(1);
  });

  it("is idempotent under a genuine duplicate submission", async () => {
    const ctx = { tenantId, studentId: studentA };
    const { session } = await service.startOrResume(ctx, blueprintId, "placement_diagnostic");

    const first = await service.submitResponse(ctx, session.id, {
      clientResponseId: "dup-check",
      questionId,
      skillNodeId: skillId,
      answer: "A",
      isCorrect: true,
      questionDifficulty: "medium",
      expectedDurationMs: 30000,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 28000,
      hintUsed: false,
      attemptNumber: 1,
      wasPreviouslyExposed: false,
    });
    const second = await service.submitResponse(ctx, session.id, {
      clientResponseId: "dup-check",
      questionId,
      skillNodeId: skillId,
      answer: "B", // even a different answer payload must not create a second row
      isCorrect: false,
      questionDifficulty: "medium",
      expectedDurationMs: 30000,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 28000,
      hintUsed: false,
      attemptNumber: 1,
      wasPreviouslyExposed: false,
    });

    expect(first.ok && !first.duplicate).toBe(true);
    expect(second.ok && second.duplicate).toBe(true);
    if (first.ok && second.ok) expect(second.responseId).toBe(first.responseId);

    const verifyClient = await ownerPool.connect();
    try {
      await verifyClient.query("BEGIN");
      await verifyClient.query("select set_config('app.current_student_id', $1, true), set_config('app.current_tenant_id', $2, true)", [studentA, tenantId]);
      const { rows: countRows } = await verifyClient.query(
        "select count(*) from diagnostic_responses where session_id = $1 and client_response_id = 'dup-check'",
        [session.id],
      );
      await verifyClient.query("COMMIT");
      expect(Number(countRows[0].count)).toBe(1);
    } finally {
      verifyClient.release();
    }
  });

  it("REAL CONCURRENCY RACE: two simultaneous identical submissions still produce exactly one row", async () => {
    const ctx = { tenantId, studentId: studentB };
    const { session } = await service.startOrResume(ctx, blueprintId, "verification_diagnostic");

    const submitOnce = () =>
      service.submitResponse(ctx, session.id, {
        clientResponseId: "race-check",
        questionId,
        skillNodeId: skillId,
        answer: "A",
        isCorrect: true,
        questionDifficulty: "medium",
        expectedDurationMs: 30000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 28000,
        hintUsed: false,
        attemptNumber: 1,
        wasPreviouslyExposed: false,
      });

    const [a, b] = await Promise.all([submitOnce(), submitOnce()]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      // exactly one of the two should be the "real" insert; the other the detected duplicate
      expect(a.duplicate !== b.duplicate).toBe(true);
      expect(a.responseId).toBe(b.responseId);
    }

    const verifyClient = await ownerPool.connect();
    try {
      await verifyClient.query("BEGIN");
      await verifyClient.query("select set_config('app.current_student_id', $1, true), set_config('app.current_tenant_id', $2, true)", [studentB, tenantId]);
      const { rows } = await verifyClient.query(
        "select count(*) from diagnostic_responses where session_id = $1 and client_response_id = 'race-check'",
        [session.id],
      );
      await verifyClient.query("COMMIT");
      expect(Number(rows[0].count)).toBe(1);
    } finally {
      verifyClient.release();
    }
  });
});

describe("Real Postgres — RLS cross-student isolation (Module 41)", () => {
  it("student B cannot read student A's session through the SECURITY DEFINER layer", async () => {
    const ctxA = { tenantId, studentId: studentA };
    const ctxB = { tenantId, studentId: studentB };

    const { session } = await service.startOrResume(ctxA, blueprintId, "topic_diagnostic");
    const asB = await repo.getSessionState(ctxB, session.id);
    expect(asB).toBeNull();
  });

  it("student B cannot submit a response into student A's session", async () => {
    const ctxA = { tenantId, studentId: studentA };
    const ctxB = { tenantId, studentId: studentB };

    const { session } = await service.startOrResume(ctxA, blueprintId, "subtopic_diagnostic");

    await expect(
      repo.submitResponse(
        ctxB,
        session.id,
        {
          clientResponseId: "hostile-attempt",
          questionId,
          skillNodeId: skillId,
          answer: "A",
          isCorrect: true,
          questionDifficulty: "medium",
          expectedDurationMs: 30000,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 28000,
          hintUsed: false,
          attemptNumber: 1,
          wasPreviouslyExposed: false,
        },
        { evidenceWeight: 1, timingClassification: "expected_correct", qualityFlags: [] },
        [],
      ),
    ).rejects.toThrow();
  });

  it("diag_app genuinely has no raw grant on any per-student table", async () => {
    await expect(appPool.query("select * from diagnostic_sessions limit 1")).rejects.toThrow(/permission denied/);
  });
});

describe("Real Postgres — session expiry (Module 33/48)", () => {
  it("rejects resuming a session whose expires_at has passed, with a specific reason, not a generic failure", async () => {
    const ctx = { tenantId, studentId: studentA };
    const { session } = await service.startOrResume(ctx, blueprintId, "company_diagnostic");
    await service.pause(ctx, session.id);

    // Manipulate expires_at directly — this column only exists in the real
    // schema, which is exactly why this test lives here and not in the
    // in-memory edge-case suite.
    const client = await ownerPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("select set_config('app.current_student_id', $1, true), set_config('app.current_tenant_id', $2, true)", [studentA, tenantId]);
      await client.query("update diagnostic_sessions set expires_at = now() - interval '1 day' where id = $1", [session.id]);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const resumeResult = await service.resume(ctx, session.id);
    expect(resumeResult.ok).toBe(false);
    expect(resumeResult.reason).toBe("SESSION_EXPIRED");
  });
});
