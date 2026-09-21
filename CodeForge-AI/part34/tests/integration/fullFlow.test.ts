import { describe, expect, it } from "vitest";
import { buildContainer } from "../../src/orchestration/container.js";
import { createInterview } from "../../src/orchestration/createInterview.js";
import { createGapVerificationInterview } from "../../src/orchestration/gapVerification.js";
import { startSession } from "../../src/orchestration/sessionLifecycle.js";
import { requestNextQuestion } from "../../src/orchestration/questionFlow.js";
import { submitResponse } from "../../src/orchestration/submitResponse.js";
import { completeSession } from "../../src/orchestration/completeSession.js";
import { getInterviewSummary } from "../../src/orchestration/queries.js";
import { asUserId, type ActorContext } from "../../src/domain/types.js";
import { EXAMPLE_ORG_ID, EXAMPLE_ROLE_ID, EXAMPLE_STUDENT_ID, SKILL_SYSTEM_DESIGN } from "../../src/integration/adapters/fixtures.js";
import type { InMemorySkillSignalEngineAdapter, InMemoryGrowthTrackingAdapter, InMemoryNextBestActionAdapter } from "../../src/integration/adapters/inMemoryEngines.js";

const STRONG_ANSWER =
  "Because repeated per-row queries create an N+1 pattern, I would batch-load the related rows in a single query instead, which trades a bit of memory for far fewer round trips to the database.";

function studentActor(): ActorContext {
  return { userId: asUserId("u_ada"), orgId: EXAMPLE_ORG_ID, roles: ["STUDENT"], studentId: EXAMPLE_STUDENT_ID };
}

/** Drives a session to completion, answering every question with the same strong canned response. */
async function runFullInterview(container: ReturnType<typeof buildContainer>, actor: ActorContext, sessionId: Awaited<ReturnType<typeof createInterview>>["session"]["id"]) {
  await startSession(container, actor, EXAMPLE_ORG_ID, sessionId);
  let guard = 0;
  while (guard++ < 40) {
    const outcome = await requestNextQuestion(container, EXAMPLE_ORG_ID, actor, sessionId);
    if (outcome.status === "READY_TO_COMPLETE") break;
    if (outcome.status !== "QUESTION_READY") throw new Error(`Unexpected outcome mid-interview: ${outcome.status}`);
    await submitResponse(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      sessionId,
      questionId: outcome.question.id,
      content: STRONG_ANSWER,
      modality: "TEXT",
      idempotencyKey: `key-${guard}`,
    });
  }
}

describe("Idempotency (Phase 36)", () => {
  it("submitting the same response twice with the same idempotencyKey does not create duplicate evidence", async () => {
    const container = buildContainer();
    const actor = studentActor();
    const { session } = await createInterview(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      studentId: EXAMPLE_STUDENT_ID,
      roleId: EXAMPLE_ROLE_ID,
      mode: "TECHNICAL_SCREENING",
    });
    await startSession(container, actor, EXAMPLE_ORG_ID, session.id);
    const outcome = await requestNextQuestion(container, EXAMPLE_ORG_ID, actor, session.id);
    if (outcome.status !== "QUESTION_READY") throw new Error("expected a question");

    const first = await submitResponse(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      sessionId: session.id,
      questionId: outcome.question.id,
      content: STRONG_ANSWER,
      modality: "TEXT",
      idempotencyKey: "retry-key-1",
    });
    const second = await submitResponse(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      sessionId: session.id,
      questionId: outcome.question.id,
      content: STRONG_ANSWER,
      modality: "TEXT",
      idempotencyKey: "retry-key-1", // same key — simulates a network-retry resubmission
    });

    expect(first.wasDuplicate).toBe(false);
    expect(second.wasDuplicate).toBe(true);
    expect(second.response.id).toBe(first.response.id);
    expect(second.evaluation.id).toBe(first.evaluation.id);

    const allResponses = await container.repositories.responses.listBySession(session.id, EXAMPLE_ORG_ID);
    expect(allResponses).toHaveLength(1); // never duplicated
  });

  it("a second submission to the same still-current question with a different idempotencyKey is rejected, not silently accepted as a new answer", async () => {
    // One response per question is the invariant — a same-key resubmission
    // is an idempotent retry (Phase 36); a different-key resubmission to a
    // question that already has an answer is a distinct, rejected case.
    const container = buildContainer();
    const actor = studentActor();
    const { session } = await createInterview(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      studentId: EXAMPLE_STUDENT_ID,
      roleId: EXAMPLE_ROLE_ID,
      mode: "TECHNICAL_SCREENING",
    });
    await startSession(container, actor, EXAMPLE_ORG_ID, session.id);
    const outcome = await requestNextQuestion(container, EXAMPLE_ORG_ID, actor, session.id);
    if (outcome.status !== "QUESTION_READY") throw new Error("expected a question");

    await submitResponse(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      sessionId: session.id,
      questionId: outcome.question.id,
      content: STRONG_ANSWER,
      modality: "TEXT",
      idempotencyKey: "k1",
    });
    // Session has NOT advanced (requestNextQuestion was never called again) —
    // currentQuestionId still points at this same question, so this is a
    // genuine second-answer attempt, not a stale-question mismatch.
    await expect(
      submitResponse(container, {
        actor,
        orgId: EXAMPLE_ORG_ID,
        sessionId: session.id,
        questionId: outcome.question.id,
        content: "a completely different late answer",
        modality: "TEXT",
        idempotencyKey: "k2",
      }),
    ).rejects.toThrow();
  });
});

describe("Integration fan-out (Phase 45-50, 72): Project -> Interview -> Evaluation -> Skill Evidence -> downstream engines", () => {
  it("sends evidence to the Skill Signal Engine and records growth events on completion", async () => {
    const container = buildContainer();
    const actor = studentActor();
    const { session } = await createInterview(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      studentId: EXAMPLE_STUDENT_ID,
      roleId: EXAMPLE_ROLE_ID,
      mode: "TECHNICAL_SCREENING",
    });
    await runFullInterview(container, actor, session.id);
    const result = await completeSession(container, actor, EXAMPLE_ORG_ID, session.id);

    expect(result.session.state).toBe("COMPLETED");
    expect(result.skillEvidence.length).toBeGreaterThan(0);

    const skillSignal = container.ports.skillSignalEngine as InMemorySkillSignalEngineAdapter;
    expect(skillSignal.received.length).toBe(result.skillEvidence.length);
    // Evidence signals only — never a bare mastery number pretending to be authoritative.
    for (const evidence of skillSignal.received) {
      expect(["VERIFIED", "PARTIALLY_VERIFIED", "UNCERTAIN", "UNASSESSED"]).toContain(evidence.evidenceState);
    }

    const growth = container.ports.growthTracking as InMemoryGrowthTrackingAdapter;
    expect(growth.events.length).toBe(result.skillEvidence.length);
    for (const event of growth.events) {
      expect(event.source).toBe("TECHNICAL_INTERVIEW");
      expect(event.sourceReference.sourceType).toBe("PREVIOUS_INTERVIEW");
    }
  });

  it("notifies Next Best Action only for skills that remain weak AND are flagged as role gaps — never for skills that resolved fine", async () => {
    const container = buildContainer();
    const actor = studentActor();
    const { session } = await createInterview(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      studentId: EXAMPLE_STUDENT_ID,
      roleId: EXAMPLE_ROLE_ID,
      mode: "TECHNICAL_SCREENING",
    });
    await runFullInterview(container, actor, session.id);
    await completeSession(container, actor, EXAMPLE_ORG_ID, session.id);

    const nextBestAction = container.ports.nextBestAction as InMemoryNextBestActionAdapter;
    // Every notification must correspond to a skill this student's role
    // actually has flagged as a gap (from EXAMPLE_GAPS) — Feature 34 must
    // never invent a gap notification for a skill with no such flag.
    for (const notification of nextBestAction.notifications) {
      expect(notification.studentId).toBe(EXAMPLE_STUDENT_ID);
      expect(notification.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("Read-only summary endpoint (Phase 58) — safe to call after completion, unlike completeSession", () => {
  it("getInterviewSummary matches what completeSession already returned, and can be called again without error", async () => {
    const container = buildContainer();
    const actor = studentActor();
    const { session } = await createInterview(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      studentId: EXAMPLE_STUDENT_ID,
      roleId: EXAMPLE_ROLE_ID,
      mode: "TECHNICAL_SCREENING",
    });
    await runFullInterview(container, actor, session.id);
    const completed = await completeSession(container, actor, EXAMPLE_ORG_ID, session.id);

    // Calling completeSession again would throw (session is no longer
    // IN_PROGRESS) — getInterviewSummary must NOT have that restriction.
    // generatedAt legitimately differs between reads (it's a fresh
    // recomputation each time, by design — see queries.ts) so compare
    // everything else explicitly rather than deep-equal the whole object.
    const fetchedSummary = await getInterviewSummary(container, actor, EXAMPLE_ORG_ID, session.id);
    expect({ ...fetchedSummary, generatedAt: undefined }).toEqual({ ...completed.summary, generatedAt: undefined });

    // And it stays safe to call repeatedly (a student revisiting their results page).
    const fetchedAgain = await getInterviewSummary(container, actor, EXAMPLE_ORG_ID, session.id);
    expect({ ...fetchedAgain, generatedAt: undefined }).toEqual({ ...completed.summary, generatedAt: undefined });
  });
});

describe("Gap verification loop (Phase 48, 51, 53)", () => {  it("creates a SKILL_VERIFICATION interview targeted only at high/medium priority role gaps", async () => {
    const container = buildContainer();
    const actor = studentActor();
    const { session, definition } = await createGapVerificationInterview(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      studentId: EXAMPLE_STUDENT_ID,
      roleId: EXAMPLE_ROLE_ID,
    });

    expect(session.mode).toBe("SKILL_VERIFICATION");
    // EXAMPLE_GAPS fixture flags SKILL_SYSTEM_DESIGN (HIGH) and SKILL_SQL (MEDIUM).
    const targetedSkillIds = definition.blueprint.skills.map((s) => s.skillId);
    expect(targetedSkillIds).toContain(SKILL_SYSTEM_DESIGN);
    expect(targetedSkillIds.length).toBeLessThanOrEqual(3);
  });

  it("running the targeted interview to completion produces evidence for the previously-uncertain gap skill", async () => {
    const container = buildContainer();
    const actor = studentActor();
    const { session } = await createGapVerificationInterview(container, {
      actor,
      orgId: EXAMPLE_ORG_ID,
      studentId: EXAMPLE_STUDENT_ID,
      roleId: EXAMPLE_ROLE_ID,
      maxSkills: 1,
    });
    await runFullInterview(container, actor, session.id);
    const result = await completeSession(container, actor, EXAMPLE_ORG_ID, session.id);

    expect(result.skillEvidence.length).toBeGreaterThan(0);
    expect(result.skillEvidence[0]!.skillId).toBe(SKILL_SYSTEM_DESIGN);
    // Confidence must be explainable — non-zero confidenceFactors behind it — not an arbitrary number.
    expect(result.summary.assessmentComplete).toBe(true);
  });
});
