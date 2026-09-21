import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_TRANSITIONS, assertValidTransition, IllegalStateTransitionError, isTerminal, isRecoverable } from "../src/domain/stateMachine.js";
import { buildInterviewBlueprint, validateBlueprint, BlueprintValidationError } from "../src/domain/blueprint.js";
import { computeSkillCoverage, buildCoverageReport, decideStop, meetsThreshold } from "../src/orchestration/coverageTracker.js";
import { validateGeneratedQuestion } from "../src/orchestration/questionValidation.js";
import { decideFollowUp } from "../src/orchestration/adaptiveFollowUp.js";
import type { InterviewBlueprint, StructuredEvaluation } from "../src/domain/types.js";
import { freshHarness, staffCtx, candidateCtx, seedOneCoreSkillRole, seedProjectEvidence, runConversation } from "../fixtures/goldenScenarios.js";

describe("§37 state machine", () => {
  test("every state has an explicit (possibly empty) transition list — no state is unhandled", () => {
    const states = Object.keys(ALLOWED_TRANSITIONS);
    assert.deepEqual(new Set(states), new Set([
      "CREATED", "READY", "IN_PROGRESS", "PAUSED", "RESUMED", "COMPLETED", "EVALUATION_PENDING", "EVALUATION_FAILED", "CANCELLED",
    ]));
  });

  test("legal transitions pass, illegal ones throw IllegalStateTransitionError", () => {
    assert.doesNotThrow(() => assertValidTransition("CREATED", "READY"));
    assert.throws(() => assertValidTransition("CREATED", "COMPLETED"), IllegalStateTransitionError);
    assert.throws(() => assertValidTransition("COMPLETED", "IN_PROGRESS"), IllegalStateTransitionError);
  });

  test("COMPLETED and CANCELLED are terminal; everything else is not", () => {
    assert.equal(isTerminal("COMPLETED"), true);
    assert.equal(isTerminal("CANCELLED"), true);
    assert.equal(isTerminal("IN_PROGRESS"), false);
  });

  test("§38 — PAUSED, IN_PROGRESS, and EVALUATION_FAILED are recoverable; terminal states are not", () => {
    assert.equal(isRecoverable("PAUSED"), true);
    assert.equal(isRecoverable("EVALUATION_FAILED"), true);
    assert.equal(isRecoverable("COMPLETED"), false);
    assert.equal(isRecoverable("CREATED"), false);
  });
});

describe("§8-9 blueprint construction", () => {
  test("refuses to build when the role skill model returns zero skills, rather than inventing some", () => {
    assert.throws(
      () => buildInterviewBlueprint({
        orgId: "org1", targetRole: "Ghost Role", mode: "TECHNICAL_SCREENING", createdBy: "staff1",
        roleSkillRequirements: { role: "Ghost Role", skills: [] },
      }),
      BlueprintValidationError
    );
  });

  test("refuses when the role skill requirements are for a different role than requested", () => {
    assert.throws(
      () => buildInterviewBlueprint({
        orgId: "org1", targetRole: "Backend Engineer", mode: "TECHNICAL_SCREENING", createdBy: "staff1",
        roleSkillRequirements: { role: "Frontend Engineer", skills: [{ skill: "CSS", importance: "CORE", expectedDifficulty: "MEDIUM" }] },
      }),
      BlueprintValidationError
    );
  });

  test("§48 gap verification — restrictToSkills narrows the blueprint to only the requested skills", () => {
    const bp = buildInterviewBlueprint({
      orgId: "org1", targetRole: "Backend Engineer", mode: "GAP_VERIFICATION", createdBy: "staff1",
      roleSkillRequirements: {
        role: "Backend Engineer",
        skills: [
          { skill: "SQL", importance: "CORE", expectedDifficulty: "MEDIUM" },
          { skill: "API_DESIGN", importance: "CORE", expectedDifficulty: "MEDIUM" },
        ],
      },
      restrictToSkills: ["SQL"],
    });
    assert.deepEqual(bp.targetSkills.map((s) => s.skill), ["SQL"]);
  });

  test("validateBlueprint flags a blueprint with zero evaluation dimensions", () => {
    const bp: InterviewBlueprint = buildInterviewBlueprint({
      orgId: "org1", targetRole: "Backend Engineer", mode: "TECHNICAL_SCREENING", createdBy: "staff1",
      roleSkillRequirements: { role: "Backend Engineer", skills: [{ skill: "SQL", importance: "CORE", expectedDifficulty: "MEDIUM" }] },
      overrides: { dimensions: [] },
    });
    assert.ok(validateBlueprint(bp).length > 0);
  });
});

describe("§28-29 coverage tracking", () => {
  const bp = (): InterviewBlueprint => buildInterviewBlueprint({
    orgId: "org1", targetRole: "Backend Engineer", mode: "TECHNICAL_SCREENING", createdBy: "staff1",
    roleSkillRequirements: { role: "Backend Engineer", skills: [{ skill: "SQL", importance: "CORE", expectedDifficulty: "MEDIUM" }] },
  });

  test("meetsThreshold respects LOW < MODERATE < HIGH ordering", () => {
    assert.equal(meetsThreshold("HIGH", "MODERATE"), true);
    assert.equal(meetsThreshold("LOW", "MODERATE"), false);
    assert.equal(meetsThreshold(null, "LOW"), false);
  });

  test("a skill with zero questions is UNASSESSED regardless of importance", () => {
    const state = computeSkillCoverage({ questionsAsked: 0, highestConfidence: null }, "CORE", bp());
    assert.equal(state, "UNASSESSED");
  });

  test("enough questions but confidence below threshold stays PARTIALLY_ASSESSED, never silently promoted", () => {
    const state = computeSkillCoverage({ questionsAsked: 5, highestConfidence: "LOW" }, "CORE", bp());
    assert.equal(state, "PARTIALLY_ASSESSED");
  });

  test("§29 report.isComplete is false unless EVERY required skill is SUFFICIENTLY_ASSESSED", () => {
    const blueprint = buildInterviewBlueprint({
      orgId: "org1", targetRole: "Backend Engineer", mode: "TECHNICAL_SCREENING", createdBy: "staff1",
      roleSkillRequirements: {
        role: "Backend Engineer",
        skills: [
          { skill: "SQL", importance: "CORE", expectedDifficulty: "MEDIUM" },
          { skill: "API_DESIGN", importance: "CORE", expectedDifficulty: "MEDIUM" },
        ],
      },
    });
    const report = buildCoverageReport(blueprint, {
      SQL: { questionsAsked: 3, highestConfidence: "HIGH" },
      // API_DESIGN entirely absent from progress — never asked about
    });
    assert.equal(report.isComplete, false);
    assert.deepEqual(report.unassessed, ["API_DESIGN"]);
  });

  test("§28 decideStop reports the specific reason, not just true/false", () => {
    const blueprint = bp();
    const completeReport = buildCoverageReport(blueprint, { SQL: { questionsAsked: 3, highestConfidence: "HIGH" } });
    assert.equal(decideStop(blueprint, completeReport, 3, 1).reason, "COVERAGE_COMPLETE");

    const incompleteReport = buildCoverageReport(blueprint, { SQL: { questionsAsked: 1, highestConfidence: "LOW" } });
    assert.equal(decideStop(blueprint, incompleteReport, blueprint.timeConfig.maxQuestions, 1).reason, "MAX_QUESTIONS_REACHED");
    assert.equal(decideStop(blueprint, incompleteReport, 1, blueprint.timeConfig.maxDurationMinutes).reason, "MAX_DURATION_REACHED");
    assert.equal(decideStop(blueprint, incompleteReport, 1, 1).reason, "CONTINUE");
  });
});

describe("§17/§44 question validation", () => {
  const baseInput = {
    orgId: "org1", role: "Backend Engineer", skill: "SQL",
    questionType: "CONCEPTUAL" as const, difficulty: "MEDIUM" as const, depthLevel: "DEFINITION" as const,
    previousQuestions: ["What is normalization?"], previousAnswerSummaries: [],
  };

  test("rejects a draft that cites an evidence artifact it was never given (§44 anti-hallucination)", () => {
    const result = validateGeneratedQuestion(
      { ...baseInput, evidence: { sourceType: "PROJECT_SUBMISSION", artifactId: "real-artifact-1", summary: "x" } },
      { promptText: "Tell me about your caching layer.", questionType: "PROJECT_BASED", skill: "SQL", difficulty: "MEDIUM", citedEvidenceArtifactId: "made-up-artifact-99" },
      []
    );
    assert.equal(result.valid, false);
    assert.ok(result.problems.some((p) => p.includes("hallucinated")));
  });

  test("rejects a PROJECT_BASED/CODE_BASED question that cites no evidence at all", () => {
    const result = validateGeneratedQuestion(
      baseInput,
      { promptText: "Tell me about your caching layer in this project.", questionType: "PROJECT_BASED", skill: "SQL", difficulty: "MEDIUM" },
      []
    );
    assert.equal(result.valid, false);
  });

  test("rejects an exact duplicate of a question already asked this session", () => {
    const result = validateGeneratedQuestion(
      baseInput,
      { promptText: "What is normalization?", questionType: "CONCEPTUAL", skill: "SQL", difficulty: "MEDIUM" },
      ["What is normalization?"]
    );
    assert.equal(result.valid, false);
    assert.ok(result.problems.some((p) => p.includes("duplicate")));
  });

  test("accepts a well-formed, grounded, non-duplicate draft", () => {
    const result = validateGeneratedQuestion(
      baseInput,
      { promptText: "How does your indexing strategy handle range queries?", questionType: "CONCEPTUAL", skill: "SQL", difficulty: "MEDIUM" },
      []
    );
    assert.equal(result.valid, true);
  });
});

describe("§26-27 adaptive follow-up decision table", () => {
  const blueprint = buildInterviewBlueprint({
    orgId: "org1", targetRole: "Backend Engineer", mode: "TECHNICAL_SCREENING", createdBy: "staff1",
    roleSkillRequirements: { role: "Backend Engineer", skills: [{ skill: "SQL", importance: "CORE", expectedDifficulty: "MEDIUM" }] },
  });
  const baseEval = (over: Partial<StructuredEvaluation>): StructuredEvaluation => ({
    id: "e1", responseId: "r1", evaluationVersion: 1,
    answerQuality: "CORRECT", consistency: "CONSISTENT", dimensions: {}, evidenceConfidence: "HIGH",
    rationaleSummary: "", status: "COMPLETED", grounded: true, ...over,
  });

  test("§21 POTENTIAL_INCONSISTENCY wins even over an otherwise strong answer", () => {
    const decision = decideFollowUp({
      blueprint, currentDepthLevel: "DEFINITION", followUpsSoFarForTopic: 0, retriesAtCurrentDepth: 0,
      evaluation: baseEval({ answerQuality: "CORRECT", consistency: "POTENTIAL_INCONSISTENCY" }),
    });
    assert.equal(decision.action, "EVIDENCE_CHECK");
  });

  test("§32 an explicit DONT_KNOW moves to a new topic rather than being interrogated further", () => {
    const decision = decideFollowUp({
      blueprint, currentDepthLevel: "DEFINITION", followUpsSoFarForTopic: 0, retriesAtCurrentDepth: 0,
      evaluation: baseEval({ answerQuality: "DONT_KNOW" }),
    });
    assert.equal(decision.action, "NEW_TOPIC");
  });

  test("a weak answer gets exactly one clarification, then moves on even if still weak", () => {
    const firstPass = decideFollowUp({
      blueprint, currentDepthLevel: "DEFINITION", followUpsSoFarForTopic: 0, retriesAtCurrentDepth: 0,
      evaluation: baseEval({ answerQuality: "PARTIALLY_CORRECT", consistency: "CONSISTENT" }),
    });
    assert.equal(firstPass.action, "CLARIFICATION");

    const secondPass = decideFollowUp({
      blueprint, currentDepthLevel: "DEFINITION", followUpsSoFarForTopic: 1, retriesAtCurrentDepth: 1,
      evaluation: baseEval({ answerQuality: "PARTIALLY_CORRECT", consistency: "CONSISTENT" }),
    });
    assert.equal(secondPass.action, "NEW_TOPIC", "must not interrogate indefinitely");
  });

  test("a strong answer at the final depth rung (FAILURE_SCENARIO) moves to a new topic — the ladder has an end", () => {
    const decision = decideFollowUp({
      blueprint, currentDepthLevel: "FAILURE_SCENARIO", followUpsSoFarForTopic: 1, retriesAtCurrentDepth: 0,
      evaluation: baseEval({ answerQuality: "CORRECT", consistency: "CONSISTENT" }),
    });
    assert.equal(decision.action, "NEW_TOPIC");
  });
});

describe("§39 idempotency at the orchestrator level", () => {
  test("submitting the same idempotency key twice does not generate a second follow-up question or a second evidence submission", async () => {
    const { orchestrator, roleSkillModel, candidateEvidence, repo } = freshHarness();
    const candidateId = "cand-idem-1";
    seedOneCoreSkillRole(roleSkillModel, "Backend Engineer", "SQL");
    seedProjectEvidence(candidateEvidence, candidateId, "SQL", "Wrote the reporting queries");

    const session = await orchestrator.createInterview(staffCtx(), { candidateId, targetRole: "Backend Engineer", mode: "PROJECT_DEFENSE" });
    const { question: q1 } = await orchestrator.startSession(staffCtx(), session.id);

    const first = await orchestrator.submitResponse(candidateCtx(candidateId), {
      sessionId: session.id, questionId: q1.id, responseText: "A correct and thorough explanation of the schema design.", idempotencyKey: "same-key",
    });
    const second = await orchestrator.submitResponse(candidateCtx(candidateId), {
      sessionId: session.id, questionId: q1.id, responseText: "A DIFFERENT answer text — must be ignored since the key repeats.", idempotencyKey: "same-key",
    });

    assert.equal(second.status, "DUPLICATE_IGNORED");
    const questions = await repo.listQuestions(session.orgId, session.id);
    const responses = await repo.listResponses(session.orgId, session.id);
    assert.equal(responses.length, 1, "exactly one response row despite two submissions");
    assert.equal(responses[0]!.responseText, "A correct and thorough explanation of the schema design.", "the FIRST response wins, never the retried body");
    // first call may have produced a follow-up or moved topics; the point is
    // the SECOND call must not have produced yet another one on top of it.
    if (first.status === "NEXT_QUESTION") {
      assert.equal(questions.length, 2);
    }
  });
});

describe("§30-32 partial answers are never binary", () => {
  test("an INSUFFICIENT answer still produces question-level evidence, not a thrown error or a silent drop", async () => {
    const { orchestrator, roleSkillModel, candidateEvidence, repo, aiGateway } = freshHarness();
    const candidateId = "cand-insufficient-1";
    seedOneCoreSkillRole(roleSkillModel, "Backend Engineer", "SQL");
    seedProjectEvidence(candidateEvidence, candidateId, "SQL", "Wrote the reporting queries");
    const session = await orchestrator.createInterview(staffCtx(), { candidateId, targetRole: "Backend Engineer", mode: "PROJECT_DEFENSE" });
    const { question: q1 } = await orchestrator.startSession(staffCtx(), session.id);

    aiGateway.scriptedAnswerQuality.push("INSUFFICIENT");
    await runConversation(orchestrator, candidateCtx(candidateId), session.id, q1.id, ["not sure"]);

    const evaluations = await repo.listEvaluations(session.orgId, session.id);
    assert.equal(evaluations.length, 1);
    assert.equal(evaluations[0]!.answerQuality, "INSUFFICIENT");
    assert.equal(evaluations[0]!.status, "COMPLETED", "an insufficient answer is still a completed evaluation, not a pipeline failure");
  });
});

describe("§45 AI failure never becomes a candidate failure", () => {
  test("a thrown AI gateway error moves the session to EVALUATION_FAILED, not a bad grade", async () => {
    const { orchestrator, roleSkillModel, candidateEvidence, repo, aiGateway } = freshHarness();
    const candidateId = "cand-ai-fail-1";
    seedOneCoreSkillRole(roleSkillModel, "Backend Engineer", "SQL");
    seedProjectEvidence(candidateEvidence, candidateId, "SQL", "Wrote the reporting queries");
    const session = await orchestrator.createInterview(staffCtx(), { candidateId, targetRole: "Backend Engineer", mode: "PROJECT_DEFENSE" });
    const { question: q1 } = await orchestrator.startSession(staffCtx(), session.id);

    aiGateway.failNextEvaluation = true;
    const result = await orchestrator.submitResponse(candidateCtx(candidateId), {
      sessionId: session.id, questionId: q1.id, responseText: "an answer", idempotencyKey: "k1",
    });

    assert.equal(result.status, "EVALUATION_FAILED");
    const finalSession = await repo.getSession(session.orgId, session.id);
    assert.equal(finalSession!.state, "EVALUATION_FAILED");
    const evaluations = await repo.listEvaluations(session.orgId, session.id);
    assert.equal(evaluations.length, 0, "no evaluation row — a failure produces no evidence at all, not a fabricated one");
  });
});
