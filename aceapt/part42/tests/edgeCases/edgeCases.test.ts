import { describe, it, expect } from "vitest";
import { makeTestBlueprint, NODE } from "../fixtures/blueprintFixture.js";
import { buildStudentProfile } from "../../src/engine/studentProfileBuilder.js";
import { DiagnosticSessionService } from "../../src/engine/sessionManager.js";
import { InMemoryDiagnosticRepository } from "../../src/repositories/inMemoryDiagnosticRepository.js";
import { InMemoryQuestionBank } from "../../src/repositories/questionBank.js";
import { deterministicMistakeIntelligence } from "../../src/engine/errorSignals.js";
import { deterministicExplanationProvider } from "../../src/ai/deterministicFallback.js";
import { makeQuestionPool } from "../fixtures/questionPoolFixture.js";

const blueprint = makeTestBlueprint();

describe("Module 56 — zero and minimal evidence", () => {
  it("zero responses: builds a profile without crashing, everything reads incomplete", () => {
    const profile = buildStudentProfile({ sessionId: "s", studentId: "st", blueprint, responses: [] });
    expect(profile.overallStatus).toBe("incomplete");
    expect(profile.skillProfiles.every((s) => s.confidenceState === "incomplete")).toBe(true);
    expect(profile.strengths).toHaveLength(0);
    expect(profile.weaknesses).toHaveLength(0);
  });

  it("one response: reads as low confidence, not high or incomplete", () => {
    const profile = buildStudentProfile({
      sessionId: "s",
      studentId: "st",
      blueprint,
      responses: [
        { skillNodeId: NODE.percentageBasics, isCorrect: true, durationMs: 20000, expectedDurationMs: 30000, difficulty: "medium", evidenceWeight: 1, createdAt: new Date().toISOString() },
      ],
    });
    const est = profile.skillProfiles.find((s) => s.skillNodeId === NODE.percentageBasics)!;
    expect(est.confidenceState).toBe("low");
    expect(est.evidenceCount).toBe(1);
  });

  it("all correct: reports strength, not an error or an implausible 100% claim treated as certain", () => {
    const responses = Array.from({ length: 10 }, (_, i) => ({
      skillNodeId: NODE.percentageBasics,
      isCorrect: true,
      durationMs: 25000,
      expectedDurationMs: 30000,
      difficulty: "medium" as const,
      evidenceWeight: 1,
      createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
    const profile = buildStudentProfile({ sessionId: "s", studentId: "st", blueprint, responses });
    const est = profile.skillProfiles.find((s) => s.skillNodeId === NODE.percentageBasics)!;
    expect(est.status).toBe("strong");
    expect(est.pointEstimate).toBeLessThan(1); // prior shrinkage means never a literal 100% claim
  });

  it("all incorrect: reports needs_focus, not a crash from an all-zero denominator anywhere", () => {
    const responses = Array.from({ length: 10 }, (_, i) => ({
      skillNodeId: NODE.percentageBasics,
      isCorrect: false,
      durationMs: 25000,
      expectedDurationMs: 30000,
      difficulty: "medium" as const,
      evidenceWeight: 1,
      createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
    const profile = buildStudentProfile({ sessionId: "s", studentId: "st", blueprint, responses });
    const est = profile.skillProfiles.find((s) => s.skillNodeId === NODE.percentageBasics)!;
    expect(est.status).toBe("needs_focus");
    expect(est.pointEstimate).toBeGreaterThan(0); // prior shrinkage — never a literal 0% claim either
  });

  it("a skipped question contributes to evidence count tracking but not to the accuracy computation", () => {
    const profile = buildStudentProfile({
      sessionId: "s",
      studentId: "st",
      blueprint,
      responses: [
        { skillNodeId: NODE.percentageBasics, isCorrect: true, durationMs: 20000, expectedDurationMs: 30000, difficulty: "medium", evidenceWeight: 1, createdAt: "2026-01-01T00:00:00Z" },
        { skillNodeId: NODE.percentageBasics, isCorrect: null, durationMs: 500, expectedDurationMs: 30000, difficulty: "medium", evidenceWeight: 0, createdAt: "2026-01-01T00:01:00Z" },
      ],
    });
    const est = profile.skillProfiles.find((s) => s.skillNodeId === NODE.percentageBasics)!;
    expect(est.evidenceCount).toBe(1); // the skip doesn't count as a countable response
  });
});

describe("Module 56 — session/service level edge cases (in-memory)", () => {
  function setup() {
    const repo = new InMemoryDiagnosticRepository();
    repo.seedBlueprint(blueprint);
    const questionBank = new InMemoryQuestionBank();
    return { repo, questionBank, service: new DiagnosticSessionService(repo, questionBank, deterministicMistakeIntelligence, deterministicExplanationProvider) };
  }

  it("duplicate submission (in-memory path) is idempotent, matching the Postgres behavior", async () => {
    const { repo, questionBank, service } = setup();
    questionBank.seed(makeQuestionPool(NODE.percentageBasics, 3));
    const ctx = { tenantId: "t", studentId: "st" };
    const { session } = await service.startOrResume(ctx, blueprint.id, "first_diagnostic");

    const payload = {
      clientResponseId: "dup",
      questionId: "q-x",
      skillNodeId: NODE.percentageBasics,
      answer: "A",
      isCorrect: true,
      questionDifficulty: "medium" as const,
      expectedDurationMs: 30000,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 25000,
      hintUsed: false,
      attemptNumber: 1,
      wasPreviouslyExposed: false,
    };
    const first = await service.submitResponse(ctx, session.id, payload);
    const second = await service.submitResponse(ctx, session.id, payload);
    expect(first.ok && !first.duplicate).toBe(true);
    expect(second.ok && second.duplicate).toBe(true);

    const state = await repo.getSessionState(ctx, session.id);
    expect(state?.responseCount).toBe(1);
  });

  it("cannot resume a completed session (invalid transition, not a silent no-op)", async () => {
    const { repo, service } = setup();
    const ctx = { tenantId: "t", studentId: "st" };
    const { session } = await service.startOrResume(ctx, blueprint.id, "first_diagnostic");
    await repo.completeSession(ctx, session.id, buildStudentProfile({ sessionId: session.id, studentId: "st", blueprint, responses: [] }));

    const resumeResult = await service.resume(ctx, session.id);
    expect(resumeResult.ok).toBe(false);
  });

  it("cannot pause an already-paused session twice", async () => {
    const { repo, service } = setup();
    const ctx = { tenantId: "t", studentId: "st" };
    const { session } = await service.startOrResume(ctx, blueprint.id, "first_diagnostic");
    const firstPause = await service.pause(ctx, session.id);
    const secondPause = await service.pause(ctx, session.id);
    expect(firstPause.ok).toBe(true);
    expect(secondPause.ok).toBe(false);
  });

  it("insufficient question pool: getNextStep stops gracefully instead of throwing when no candidates exist anywhere", async () => {
    const { service } = setup(); // note: questionBank is never seeded — pool is empty
    const ctx = { tenantId: "t", studentId: "st" };
    const { session } = await service.startOrResume(ctx, blueprint.id, "first_diagnostic");

    const step = await service.getNextStep(ctx, session.id);
    expect(step.done).toBe(true);
  });

  it("reassessment with no prior completed diagnostic is rejected with a clear reason, not a crash", async () => {
    const { service } = setup();
    const ctx = { tenantId: "t", studentId: "st" };
    const result = await service.startReassessment(ctx, blueprint.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NO_PRIOR_DIAGNOSTIC_TO_COMPARE_AGAINST");
  });
});

// Session expiry (expires_at) only exists in the real schema, not the
// in-memory repo (see TRUTH_TABLE.md for that scope boundary) — it's
// tested for real, with a genuine manipulated timestamp and a genuine
// assertion, in tests/integration/postgresIntegration.test.ts.
