import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  freshHarness,
  staffCtx,
  candidateCtx,
  FIXTURE_CANDIDATES,
  seedTwoCoreSkillRole,
  seedOneCoreSkillRole,
  seedProjectEvidence,
  seedCodeEvidence,
  runConversation,
} from "../fixtures/goldenScenarios.js";

describe("§70 golden scenario: Strong Project Defense -> strong understanding evidence", () => {
  test("both core skills end VERIFIED with HIGH confidence, interview reports complete coverage", async () => {
    const { orchestrator, roleSkillModel, candidateEvidence, skillSignalEngine, aiGateway } = freshHarness();
    const candidateId = FIXTURE_CANDIDATES.strongProjectDefender;
    seedTwoCoreSkillRole(roleSkillModel);
    seedProjectEvidence(candidateEvidence, candidateId, "SQL", "Built a normalized order-tracking schema with composite indexes");
    seedProjectEvidence(candidateEvidence, candidateId, "API_DESIGN", "Designed a versioned REST API with idempotent write endpoints");

    const session = await orchestrator.createInterview(staffCtx(), {
      candidateId, targetRole: "Backend Engineer", mode: "PROJECT_DEFENSE",
    });
    const { question: firstQuestion } = await orchestrator.startSession(staffCtx(), session.id);

    aiGateway.scriptedAnswerQuality.push(...Array(10).fill("CORRECT"));
    const answers = Array(10).fill("A thorough, correct, well-reasoned explanation of the design decision and its trade-offs.");
    const results = await runConversation(orchestrator, candidateCtx(candidateId), session.id, firstQuestion.id, answers);

    const final = results[results.length - 1]!;
    assert.equal(final.status, "COMPLETED");
    if (final.status !== "COMPLETED") return;
    assert.equal(final.coverage.isComplete, true);
    assert.deepEqual(new Set(final.coverage.sufficientlyAssessed), new Set(["SQL", "API_DESIGN"]));

    assert.equal(skillSignalEngine.submissions.length, 1);
    const evidence = skillSignalEngine.submissions[0]!.evidence;
    for (const record of evidence) {
      assert.equal(record.evidenceState, "VERIFIED", `${record.skill} should be VERIFIED`);
      assert.equal(record.confidence, "HIGH");
    }
  });
});

describe("§70 golden scenario: Working Code / Weak Explanation -> limited understanding evidence", () => {
  test("interview-derived understanding evidence stays low-confidence despite strong pre-existing implementation evidence", async () => {
    const { orchestrator, roleSkillModel, candidateEvidence, skillSignalEngine, aiGateway } = freshHarness();
    const candidateId = FIXTURE_CANDIDATES.weakExplainer;
    seedOneCoreSkillRole(roleSkillModel, "Backend Engineer", "ALGORITHMS");
    // §22 — this is the PRE-EXISTING implementation evidence (from the
    // Submission System, not from Feature 35). It stays strong and
    // untouched throughout — this scenario is only about what the
    // *interview* adds on top of it.
    seedCodeEvidence(
      candidateEvidence, candidateId, "ALGORITHMS",
      "All 12 hidden tests passing, O(n log n) solution, submitted on first attempt",
      "function solve(items) { return items.sort((a,b)=>a.key-b.key); }"
    );

    const session = await orchestrator.createInterview(staffCtx(), {
      candidateId, targetRole: "Backend Engineer", mode: "CODE_DEFENSE",
    });
    const { question: firstQuestion } = await orchestrator.startSession(staffCtx(), session.id);
    assert.equal(firstQuestion.questionType, "CODE_BASED");
    assert.ok(firstQuestion.evidenceRef, "a CODE_DEFENSE root question must be grounded in the real submission");

    // Script two weak explanations in a row: root question gets one
    // clarification (the allowed retry), the clarification also comes back
    // weak, exhausting the retry budget and closing the topic out.
    aiGateway.scriptedAnswerQuality.push("INSUFFICIENT", "INSUFFICIENT");
    const results = await runConversation(
      orchestrator,
      candidateCtx(candidateId),
      session.id,
      firstQuestion.id,
      ["um, it just sorts them I think", "not totally sure how the comparator works"]
    );

    const final = results[results.length - 1]!;
    assert.equal(final.status, "COMPLETED");
    if (final.status !== "COMPLETED") return;

    const evidence = skillSignalEngine.submissions[0]!.evidence;
    const algo = evidence.find((e) => e.skill === "ALGORITHMS")!;
    assert.ok(
      algo.evidenceState === "UNCERTAIN" || algo.evidenceState === "UNASSESSED",
      `expected weak interview evidence for ALGORITHMS understanding, got ${algo.evidenceState}`
    );
    assert.notEqual(algo.confidence, "HIGH");
  });
});

describe("§70 golden scenario: Potential Code-Answer Inconsistency -> additional verification triggered", () => {
  test("a POTENTIAL_INCONSISTENCY evaluation always produces an EVIDENCE_CHECK follow-up, regardless of surface answer quality", async () => {
    const { orchestrator, roleSkillModel, candidateEvidence, aiGateway } = freshHarness();
    const candidateId = FIXTURE_CANDIDATES.inconsistentAnswerer;
    seedOneCoreSkillRole(roleSkillModel, "Backend Engineer", "CONCURRENCY");
    seedCodeEvidence(
      candidateEvidence, candidateId, "CONCURRENCY",
      "Submitted a lock-based counter implementation",
      "class Counter { increment() { this.n++; } }"
    );

    const session = await orchestrator.createInterview(staffCtx(), {
      candidateId, targetRole: "Backend Engineer", mode: "CODE_DEFENSE",
    });
    const { question: firstQuestion } = await orchestrator.startSession(staffCtx(), session.id);

    // Script: the answer READS fine (MOSTLY_CORRECT) but the model flags a
    // potential inconsistency with the actual code — §21 says this must
    // trigger verification, not be waved through because the prose sounded ok.
    aiGateway.scriptedAnswerQuality.push("MOSTLY_CORRECT");
    aiGateway.scriptedConsistency.push("POTENTIAL_INCONSISTENCY");
    aiGateway.scriptedAnswerQuality.push("MOSTLY_CORRECT");
    aiGateway.scriptedConsistency.push("CONSISTENT"); // the follow-up clears it up

    const results = await runConversation(
      orchestrator, candidateCtx(candidateId), session.id, firstQuestion.id,
      ["I used a mutex to make increments atomic across threads.", "Actually here's the lock acquisition I meant — I described it loosely before."]
    );

    const followUp = results[0]!;
    assert.equal(followUp.status, "NEXT_QUESTION");
    if (followUp.status !== "NEXT_QUESTION") return;
    assert.equal(followUp.question.followUpReason, "EVIDENCE_CHECK");
    assert.equal(followUp.question.questionType, "VERIFICATION");
  });
});

describe("§70 golden scenario: Strong Progressive Follow-Ups -> strong depth evidence", () => {
  test("three consecutive strong answers climb the depth ladder DEFINITION -> APPLICATION -> REASONING -> TRADE_OFF", async () => {
    const { orchestrator, roleSkillModel, candidateEvidence, repo } = freshHarness();
    const candidateId = FIXTURE_CANDIDATES.progressiveDepth;
    seedOneCoreSkillRole(roleSkillModel, "Backend Engineer", "SYSTEM_DESIGN");
    seedProjectEvidence(candidateEvidence, candidateId, "SYSTEM_DESIGN", "Designed a rate limiter for the public API");

    const session = await orchestrator.createInterview(staffCtx(), {
      candidateId, targetRole: "Backend Engineer", mode: "ARCHITECTURE_INTERVIEW",
    });
    const { question: firstQuestion } = await orchestrator.startSession(staffCtx(), session.id);
    assert.equal(firstQuestion.depthLevel, "DEFINITION");

    await runConversation(
      orchestrator, candidateCtx(candidateId), session.id, firstQuestion.id,
      [
        "A rate limiter caps how many requests a client can make in a window.",
        "I used a token-bucket so bursts are allowed but sustained rate is capped.",
        "Token bucket over fixed-window because fixed-window allows a 2x burst at the boundary.",
      ]
    );

    const questions = await repo.listQuestions(session.orgId, session.id);
    const depths = questions.map((q) => q.depthLevel);
    assert.deepEqual(depths, ["DEFINITION", "APPLICATION", "REASONING", "TRADE_OFF"]);
    const followUps = questions.slice(1);
    for (const q of followUps) {
      assert.equal(q.followUpReason, "DEEPER");
      assert.equal(q.parentQuestionId, questions[questions.indexOf(q) - 1]!.id);
    }
  });
});

describe("§70 golden scenario: Incomplete Skill Coverage -> honestly incomplete assessment", () => {
  test("hitting maxQuestions mid-chain leaves one skill UNASSESSED and isComplete=false, never silently upgraded", async () => {
    const { orchestrator, roleSkillModel, candidateEvidence, skillSignalEngine, aiGateway } = freshHarness();
    const candidateId = FIXTURE_CANDIDATES.partialCoverage;
    seedTwoCoreSkillRole(roleSkillModel);
    seedProjectEvidence(candidateEvidence, candidateId, "SQL", "Wrote the reporting queries");
    seedProjectEvidence(candidateEvidence, candidateId, "API_DESIGN", "Designed the public endpoints");

    const session = await orchestrator.createInterview(staffCtx(), {
      candidateId, targetRole: "Backend Engineer", mode: "PROJECT_DEFENSE",
      overrides: { maxQuestions: 3 },
    });
    const { question: firstQuestion } = await orchestrator.startSession(staffCtx(), session.id);

    aiGateway.scriptedAnswerQuality.push("CORRECT", "CORRECT", "CORRECT", "CORRECT");
    const results = await runConversation(
      orchestrator, candidateCtx(candidateId), session.id, firstQuestion.id,
      ["Strong correct answer one.", "Strong correct answer two.", "Strong correct answer three.", "Strong correct answer four (should never be asked)."]
    );

    const final = results[results.length - 1]!;
    assert.equal(final.status, "COMPLETED");
    if (final.status !== "COMPLETED") return;
    assert.equal(final.coverage.isComplete, false, "coverage must NOT be reported complete when a target skill was never touched");
    assert.equal(final.coverage.unassessed.length, 1);
    assert.equal(final.coverage.sufficientlyAssessed.length, 1);

    const evidence = skillSignalEngine.submissions[0]!.evidence;
    // §11/§29 — the untouched skill must not appear as evidence at all (not
    // even as a fabricated UNASSESSED record) — evidence is only emitted
    // for skills that were actually asked about.
    assert.equal(evidence.length, 1);
  });
});
