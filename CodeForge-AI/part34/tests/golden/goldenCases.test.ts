import { describe, expect, it } from "vitest";
import { evaluateResponse } from "../../src/engine/evaluation/pipeline.js";
import { extractSkillEvidence } from "../../src/engine/evidenceExtraction.js";
import { buildInterviewSummary } from "../../src/engine/summary.js";
import { updateSkillCoverage } from "../../src/engine/coverage.js";
import {
  asEvaluationId,
  asEvidenceSourceId,
  asInterviewDefinitionId,
  asOrgId,
  asQuestionId,
  asResponseId,
  asRoleId,
  asSessionId,
  asSkillId,
  asStudentId,
  CONSISTENCY_CLASSES,
  type BlueprintSkillTarget,
  type Evaluation,
  type EvaluationConfig,
  type InterviewSession,
  type Question,
  type Response,
  type StudentEvidenceContext,
} from "../../src/domain/types.js";
import type { AIEvaluationContext, AIEvaluationRaw, AIGatewayPort, AIGeneratedQuestion, AIQuestionGenerationContext, ReasoningVerificationPort, UnderstandingCheckPort } from "../../src/integration/ports.js";

const SESSION_ID = asSessionId("sess_golden");
const ROLE_ID = asRoleId("role_backend");
const SKILL_ID = asSkillId("skill_system_design");
const STUDENT_ID = asStudentId("student_golden");

const FULL_DIMENSIONS: EvaluationConfig = {
  dimensions: ["technicalCorrectness", "reasoningQuality", "understanding", "depth", "application", "communicationClarity"],
  requireConsistencyCheck: true,
};

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: asQuestionId("q_golden"),
    sessionId: SESSION_ID,
    skillId: SKILL_ID,
    mode: "PROJECT_DEFENSE",
    text: "Walk me through how your caching layer handles a cache-miss storm.",
    origin: "AI_GENERATED",
    difficulty: 3,
    groundedIn: [],
    isFollowUp: false,
    validation: { isValid: true, checkedAt: "2026-01-01T00:00:00.000Z", failedChecks: [] },
    askedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeResponse(content: string, overrides: Partial<Response> = {}): Response {
  return {
    id: asResponseId("resp_golden"),
    sessionId: SESSION_ID,
    questionId: asQuestionId("q_golden"),
    studentId: STUDENT_ID,
    modality: "TEXT",
    content,
    submittedAt: "2026-01-01T00:00:05.000Z",
    idempotencyKey: "k1",
    ...overrides,
  };
}

const EMPTY_EVIDENCE: StudentEvidenceContext = { studentId: STUDENT_ID, perSkill: {} };

/** A scripted AI gateway that returns exactly the raw evaluation the test hands it — the golden cases are about what the PIPELINE does with a given AI verdict, not about generating realistic verdicts. */
function scriptedAiGateway(raw: AIEvaluationRaw): AIGatewayPort {
  return {
    async generateQuestion(_ctx: AIQuestionGenerationContext): Promise<AIGeneratedQuestion> {
      throw new Error("not used in golden evaluation tests");
    },
    async evaluateResponse(_ctx: AIEvaluationContext): Promise<AIEvaluationRaw> {
      return raw;
    },
  };
}

const NEUTRAL_REASONING: ReasoningVerificationPort = {
  async verifyReasoning() {
    return { assumptionsIdentified: [], logicalProgressionSound: true, alternativesConsidered: false, tradeoffsAddressed: false, notes: "" };
  },
};
const NEUTRAL_UNDERSTANDING: UnderstandingCheckPort = {
  async checkUnderstanding(input) {
    return { understandingDemonstrated: "NOT_DEMONSTRATED", distinguishesImplementationFromUnderstanding: input.implementationEvidence.length > 0, notes: "" };
  },
};

describe("Golden Case 1 — Strong Project Defense (Phase 73)", () => {
  it("produces strong understanding evidence for an accurate, well-reasoned explanation", async () => {
    const question = makeQuestion();
    const response = makeResponse(
      "The cache uses request coalescing: concurrent misses for the same key wait on one in-flight fetch instead of stampeding the database, because I measured a 40x spike in DB load without it during a load test.",
    );
    const aiGateway = scriptedAiGateway({
      correctness: "CORRECT",
      reasoningQuality: "STRONG",
      understanding: "DEMONSTRATED",
      depth: "DEEP",
      application: "APPLIED_CORRECTLY",
      communicationClarity: "CLEAR",
      rationale: "Accurately describes request coalescing with a concrete measured justification.",
      citedEvidence: [],
    });

    const evaluation = await evaluateResponse(
      {
        aiGateway,
        reasoningVerification: NEUTRAL_REASONING,
        understandingCheck: {
          async checkUnderstanding() {
            return { understandingDemonstrated: "DEMONSTRATED", distinguishesImplementationFromUnderstanding: true, notes: "" };
          },
        },
      },
      {
        question,
        response,
        roleId: ROLE_ID,
        studentEvidence: EMPTY_EVIDENCE,
        evaluationConfig: FULL_DIMENSIONS,
        priorQuestionCountForSkill: 0,
        priorEvidenceConfidence: 0,
        followUpDepthForSkill: 0,
        maxFollowUpDepth: 2,
      },
    );

    expect(evaluation.status).toBe("OK");
    expect(evaluation.dimensions.understanding).toBe("DEMONSTRATED");
    expect(evaluation.adaptiveSignal).toBe("STRONG");
    expect(evaluation.confidence).toBeGreaterThan(0.3);
  });
});

describe("Golden Case 2 — Working Code, Weak Understanding (Phase 73)", () => {
  it("keeps implementation evidence and understanding evidence as separate signals", async () => {
    // Implementation evidence is strong and PRE-EXISTING (from actual code
    // submission, not from this interview) — modeled as already VERIFIED
    // in the student's evidence snapshot.
    const strongImplementationEvidence: StudentEvidenceContext = {
      studentId: STUDENT_ID,
      perSkill: { [SKILL_ID]: { skillId: SKILL_ID, evidenceState: "VERIFIED", confidence: 0.85, sources: [], lastUpdated: "2026-01-01T00:00:00.000Z" } },
    };

    const question = makeQuestion();
    const response = makeResponse("Um, I think it just... caches the thing? I copied that part from a tutorial.");
    const aiGateway = scriptedAiGateway({
      correctness: "PARTIALLY_CORRECT",
      reasoningQuality: "WEAK",
      understanding: "NOT_DEMONSTRATED",
      depth: "SURFACE",
      application: "NOT_APPLIED",
      communicationClarity: "UNCLEAR",
      rationale: "Student cannot explain the mechanism despite the code working.",
      citedEvidence: [],
    });

    const evaluation = await evaluateResponse(
      {
        aiGateway,
        reasoningVerification: NEUTRAL_REASONING,
        understandingCheck: {
          async checkUnderstanding() {
            return { understandingDemonstrated: "NOT_DEMONSTRATED", distinguishesImplementationFromUnderstanding: true, notes: "Implementation evidence exists independently of this explanation." };
          },
        },
      },
      {
        question,
        response,
        roleId: ROLE_ID,
        studentEvidence: strongImplementationEvidence,
        evaluationConfig: FULL_DIMENSIONS,
        priorQuestionCountForSkill: 0,
        priorEvidenceConfidence: strongImplementationEvidence.perSkill[SKILL_ID]!.confidence,
        followUpDepthForSkill: 0,
        maxFollowUpDepth: 2,
      },
    );

    // Implementation evidence (pre-existing) stays strong/untouched...
    expect(strongImplementationEvidence.perSkill[SKILL_ID]!.evidenceState).toBe("VERIFIED");
    // ...while THIS interview's understanding evidence is independently limited:
    // the response is correctly read as ambiguous-at-best (never STRONG),
    // even though the underlying code (a separate evidence source) works.
    expect(evaluation.dimensions.understanding).toBe("NOT_DEMONSTRATED");
    expect(evaluation.adaptiveSignal).not.toBe("STRONG");
  });
});

describe("Golden Case 3 — Potential Inconsistency (Phase 73)", () => {
  it("flags a potential inconsistency without ever producing a dishonesty label", async () => {
    const question = makeQuestion({
      groundedIn: [{ sourceType: "PROJECT_SUBMISSION", sourceId: asEvidenceSourceId("excerpt_1"), description: "auth middleware", capturedAt: "2026-01-01T00:00:00.000Z" }],
    });
    const response = makeResponse("Yes, this endpoint fully validates every field against the database schema before writing, including foreign key constraints.");
    const aiGateway = scriptedAiGateway({
      correctness: "PARTIALLY_CORRECT",
      understanding: "PARTIAL",
      consistency: "POTENTIAL_INCONSISTENCY",
      rationale: "The described validation does not appear in the supplied code excerpt.",
      citedEvidence: [],
    });

    const evaluation = await evaluateResponse(
      { aiGateway, reasoningVerification: NEUTRAL_REASONING, understandingCheck: NEUTRAL_UNDERSTANDING },
      {
        question,
        response,
        roleId: ROLE_ID,
        studentEvidence: {
          studentId: STUDENT_ID,
          perSkill: {},
          projectContext: {
            projectId: asEvidenceSourceId("p1"),
            title: "t",
            verifiedComponents: ["basic field presence check only"],
            codeExcerpts: [
              {
                id: "excerpt_1",
                filePath: "src/routes/orders.js",
                language: "javascript",
                startLine: 1,
                endLine: 5,
                content: "router.post('/orders', (req, res) => {\n  if (!req.body.sku) return res.status(400).end();\n  Order.create(req.body).then(o => res.json(o));\n});",
                relatedSkillIds: [SKILL_ID],
              },
            ],
          },
        },
        evaluationConfig: FULL_DIMENSIONS,
        priorQuestionCountForSkill: 0,
        priorEvidenceConfidence: 0,
        followUpDepthForSkill: 0,
        maxFollowUpDepth: 2,
      },
    );

    expect(evaluation.consistency).toBe("POTENTIAL_INCONSISTENCY");
    expect(evaluation.adaptiveSignal).toBe("CONTRADICTION"); // triggers a verification follow-up, not an accusation
    // The type system itself cannot express anything stronger than these four classes.
    expect(CONSISTENCY_CLASSES).not.toContain("DISHONEST");
    expect(CONSISTENCY_CLASSES).not.toContain("CHEATING");
    expect([...CONSISTENCY_CLASSES]).toEqual(["CONSISTENT", "PARTIALLY_CONSISTENT", "UNCERTAIN", "POTENTIAL_INCONSISTENCY"]);
  });
});

describe("Golden Case 4 — Strong Follow-Up Performance (Phase 73)", () => {
  it("produces stronger depth evidence as follow-ups succeed", async () => {
    const baseQuestion = makeQuestion({ id: asQuestionId("q_base"), isFollowUp: false, difficulty: 2 });
    const baseResponse = makeResponse("It uses an LRU cache with a 5 minute TTL.", { questionId: asQuestionId("q_base") });
    const baseAi = scriptedAiGateway({ correctness: "MOSTLY_CORRECT", reasoningQuality: "ADEQUATE", depth: "SURFACE", rationale: "Correct but shallow.", citedEvidence: [] });

    const baseEval = await evaluateResponse(
      { aiGateway: baseAi, reasoningVerification: NEUTRAL_REASONING, understandingCheck: NEUTRAL_UNDERSTANDING },
      {
        question: baseQuestion,
        response: baseResponse,
        roleId: ROLE_ID,
        studentEvidence: EMPTY_EVIDENCE,
        evaluationConfig: FULL_DIMENSIONS,
        priorQuestionCountForSkill: 0,
        priorEvidenceConfidence: 0,
        followUpDepthForSkill: 0,
        maxFollowUpDepth: 2,
      },
    );

    const followUpQuestion = makeQuestion({ id: asQuestionId("q_follow1"), isFollowUp: true, parentQuestionId: baseQuestion.id, difficulty: 4 });
    const followUpResponse = makeResponse(
      "Because eviction is time-based not access-based, a hot key can still get evicted mid-spike; I'd switch to LFU with a floor TTL so frequently-hit keys survive bursts.",
      { questionId: asQuestionId("q_follow1") },
    );
    const followAi = scriptedAiGateway({ correctness: "CORRECT", reasoningQuality: "STRONG", depth: "DEEP", understanding: "DEMONSTRATED", rationale: "Identifies the real trade-off and proposes a sound fix.", citedEvidence: [] });

    const followEval = await evaluateResponse(
      {
        aiGateway: followAi,
        reasoningVerification: NEUTRAL_REASONING,
        understandingCheck: {
          async checkUnderstanding() {
            return { understandingDemonstrated: "DEMONSTRATED", distinguishesImplementationFromUnderstanding: true, notes: "" };
          },
        },
      },
      {
        question: followUpQuestion,
        response: followUpResponse,
        roleId: ROLE_ID,
        studentEvidence: EMPTY_EVIDENCE,
        evaluationConfig: FULL_DIMENSIONS,
        priorQuestionCountForSkill: 1,
        priorEvidenceConfidence: 0,
        followUpDepthForSkill: 1,
        maxFollowUpDepth: 2,
      },
    );

    // The base answer is correct with sound-but-not-deep reasoning — exactly
    // the profile that should prompt going deeper (Phase 21's STRONG ->
    // deeper follow-up), not one the engine should treat as a dead end.
    expect(baseEval.adaptiveSignal).toBe("STRONG");
    expect(followEval.adaptiveSignal).toBe("STRONG");
    expect(followEval.confidenceFactors.followUpDepth).toBeGreaterThan(baseEval.confidenceFactors.followUpDepth);
    expect(followEval.confidence).toBeGreaterThan(baseEval.confidence);
  });
});

describe("Golden Case 5 — Incomplete Assessment (Phase 73)", () => {
  it("honestly reports assessmentComplete=false when required skills were never assessed", () => {
    const skillA = asSkillId("skill_a");
    const skillB = asSkillId("skill_b");
    const skillC = asSkillId("skill_c");
    const targets: BlueprintSkillTarget[] = [
      { skillId: skillA, importance: "CORE", minQuestions: 2, maxQuestions: 4 },
      { skillId: skillB, importance: "CORE", minQuestions: 2, maxQuestions: 4 },
      { skillId: skillC, importance: "CORE", minQuestions: 2, maxQuestions: 4 },
    ];

    // Only skill_a was actually assessed — skill_b and skill_c never touched.
    const coverageA = updateSkillCoverage(targets[0]!, undefined, 2, 0, "VERIFIED", 0.8);

    const session: InterviewSession = {
      id: SESSION_ID,
      orgId: asOrgId("org_1"),
      studentId: STUDENT_ID,
      interviewDefinitionId: asInterviewDefinitionId("def_1"),
      roleId: ROLE_ID,
      mode: "DEEP_TECHNICAL",
      state: "IN_PROGRESS",
      versionInfo: { interviewVersion: "v1", roleModelVersion: "v1", evaluationVersion: "v1" },
      coverage: { [skillA]: coverageA },
      questionIds: [asQuestionId("q1"), asQuestionId("q2")],
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const summary = buildInterviewSummary(session, targets, { minSkillsSufficientlyAssessed: "ALL_CORE", minQuestionsTotal: 2, maxQuestionsTotal: 12 }, []);

    expect(summary.assessmentComplete).toBe(false);
    expect(summary.technicalGaps).toEqual(expect.arrayContaining([skillB, skillC]));
    expect(summary.verifiedSkills).toEqual([skillA]);
  });
});

describe("Golden Case supplement — Skill Evidence extraction never overclaims (Phase 44)", () => {
  it("an evidence signal with zero usable evaluations produces UNASSESSED, not an invented score", () => {
    const target: BlueprintSkillTarget = { skillId: SKILL_ID, importance: "CORE", minQuestions: 2, maxQuestions: 4 };
    const coverage = updateSkillCoverage(target, undefined, 0, 0, "UNASSESSED", 0);
    const evidence = extractSkillEvidence(SESSION_ID, coverage, []);
    expect(evidence.evidenceState).toBe("UNASSESSED");
    expect(evidence.sourceEvaluationIds).toEqual([]);
  });

  it("a PENDING evaluation is excluded from sourceEvaluationIds (never silently counted as evidence)", () => {
    const target: BlueprintSkillTarget = { skillId: SKILL_ID, importance: "CORE", minQuestions: 2, maxQuestions: 4 };
    const coverage = updateSkillCoverage(target, undefined, 1, 0, "UNASSESSED", 0);
    const pendingEval: Evaluation = {
      id: asEvaluationId("ev_pending"),
      sessionId: SESSION_ID,
      questionId: asQuestionId("q1"),
      responseId: asResponseId("r1"),
      skillId: SKILL_ID,
      status: "EVALUATION_PENDING",
      dimensions: {},
      adaptiveSignal: "UNCERTAIN",
      confidence: 0,
      confidenceFactors: { responseQuality: 0, questionDifficulty: 0.5, questionCount: 1, evidenceConsistency: 0, projectCodeAlignment: null, priorEvidenceWeight: 0, followUpDepth: 0 },
      groundingRefs: [],
      evaluationVersion: "v1",
      evaluatedAt: "2026-01-01T00:00:00.000Z",
    };
    const evidence = extractSkillEvidence(SESSION_ID, coverage, [pendingEval]);
    expect(evidence.sourceEvaluationIds).toEqual([]);
  });
});
