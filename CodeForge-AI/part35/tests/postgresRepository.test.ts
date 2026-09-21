import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPgPool, PostgresInterviewRepository } from "../src/repository/interviewRepository.postgres.js";
import { InterviewOrchestrator } from "../src/orchestration/interviewOrchestrator.js";
import {
  InMemoryRoleSkillModel,
  InMemoryCandidateEvidenceSource,
  RecordingSkillSignalEngine,
  SimulatedAIGateway,
  NoopVoice,
  ConsoleAuditLog,
} from "../src/integration/devAdapters.js";
import type { TenantContext } from "../src/domain/types.js";

const CONN_SVC = process.env.DATABASE_URL_SVC ?? "postgres://app_conn_service:localdevpw@localhost:5432/codeforge_dev";

describe("end-to-end: real Postgres repository (not in-memory) driving the full orchestrator", () => {
  test("a complete interview — create, start, answer through to COMPLETED — persists correctly through fn_* functions and RLS", async () => {
    const pool = createPgPool(CONN_SVC);
    const repo = new PostgresInterviewRepository(pool);
    const roleSkillModel = new InMemoryRoleSkillModel();
    const candidateEvidence = new InMemoryCandidateEvidenceSource();
    const skillSignalEngine = new RecordingSkillSignalEngine();
    const aiGateway = new SimulatedAIGateway();

    roleSkillModel.register({ role: "Backend Engineer", skills: [{ skill: "SQL", importance: "CORE", expectedDifficulty: "MEDIUM" }] });

    const orchestrator = new InterviewOrchestrator({
      repo, roleSkillModel, candidateEvidence, skillSignalEngine, aiGateway,
      voice: new NoopVoice(), auditLog: new ConsoleAuditLog(),
    });

    const orgId = randomUUID();
    const candidateId = randomUUID();
    const staffCtx: TenantContext = { orgId, actorId: randomUUID(), actorRole: "STAFF" };
    const candCtx: TenantContext = { orgId, actorId: candidateId, actorRole: "CANDIDATE" };

    const session = await orchestrator.createInterview(staffCtx, { candidateId, targetRole: "Backend Engineer", mode: "TECHNICAL_SCREENING" });
    assert.equal(session.state, "CREATED");

    const { question: q1 } = await orchestrator.startSession(staffCtx, session.id);
    assert.equal(q1.depthLevel, "DEFINITION");

    aiGateway.scriptedAnswerQuality.push("INSUFFICIENT", "INSUFFICIENT");
    let result = await orchestrator.submitResponse(candCtx, { sessionId: session.id, questionId: q1.id, responseText: "not sure", idempotencyKey: "pg-k1" });
    assert.equal(result.status, "NEXT_QUESTION");
    if (result.status !== "NEXT_QUESTION") return;

    result = await orchestrator.submitResponse(candCtx, { sessionId: session.id, questionId: result.question.id, responseText: "still not sure", idempotencyKey: "pg-k2" });
    assert.equal(result.status, "COMPLETED");
    if (result.status !== "COMPLETED") return;

    assert.equal(result.coverage.isComplete, false);
    assert.equal(skillSignalEngine.submissions.length, 1);
    assert.equal(skillSignalEngine.submissions[0]!.evidence[0]!.skill, "SQL");

    // Independently re-read straight from Postgres as STAFF to confirm what
    // actually landed, not just what the orchestrator's return value claimed.
    const persistedSession = await repo.getSession(orgId, session.id);
    assert.equal(persistedSession!.state, "COMPLETED");
    const persistedQuestions = await repo.listQuestions(orgId, session.id);
    assert.equal(persistedQuestions.length, 2);
    const persistedResponses = await repo.listResponses(orgId, session.id);
    assert.equal(persistedResponses.length, 2);

    await pool.end();
  });
});
