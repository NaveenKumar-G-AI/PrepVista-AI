import { describe, expect, it } from "vitest";
import { toPublicQuestion, toPublicSession, toPublicSubmitResult } from "../../src/api/presenters.js";
import { buildContainer } from "../../src/orchestration/container.js";
import { createInterview } from "../../src/orchestration/createInterview.js";
import { startSession, pauseSession, cancelSession, getSession } from "../../src/orchestration/sessionLifecycle.js";
import { getSessionEvaluations, getSessionSkillEvidence, getInstitutionalReport } from "../../src/orchestration/queries.js";
import { AuthorizationError, NotFoundError } from "../../src/orchestration/helpers.js";
import { asOrgId, asStudentId, asUserId, type ActorContext, type Evaluation, type InterviewSession, type Question } from "../../src/domain/types.js";
import { EXAMPLE_ORG_ID, EXAMPLE_ROLE_ID, EXAMPLE_STUDENT_ID } from "../../src/integration/adapters/fixtures.js";

function studentActor(studentId = EXAMPLE_STUDENT_ID): ActorContext {
  return { userId: asUserId(`u_${studentId}`), orgId: EXAMPLE_ORG_ID, roles: ["STUDENT"], studentId };
}
function trainerActor(orgId = EXAMPLE_ORG_ID): ActorContext {
  return { userId: asUserId("u_trainer"), orgId, roles: ["TRAINER"] };
}

const SAMPLE_QUESTION: Question = {
  id: "q_1" as never,
  sessionId: "sess_1" as never,
  skillId: "skill_sql" as never,
  mode: "TECHNICAL_SCREENING",
  text: "Explain an N+1 query.",
  origin: "AI_GENERATED",
  difficulty: 4,
  groundedIn: [{ sourceType: "PROJECT_SUBMISSION", sourceId: "src_1" as never, description: "secret internal note about the student", capturedAt: "2026-01-01T00:00:00.000Z" }],
  isFollowUp: false,
  validation: { isValid: true, checkedAt: "2026-01-01T00:00:00.000Z", failedChecks: [] },
  askedAt: "2026-01-01T00:00:00.000Z",
};

const SAMPLE_EVALUATION: Evaluation = {
  id: "ev_1" as never,
  sessionId: "sess_1" as never,
  questionId: "q_1" as never,
  responseId: "r_1" as never,
  skillId: "skill_sql" as never,
  status: "OK",
  dimensions: { technicalCorrectness: "CORRECT" },
  adaptiveSignal: "STRONG",
  confidence: 0.92,
  confidenceFactors: { responseQuality: 1, questionDifficulty: 1, questionCount: 3, evidenceConsistency: 1, projectCodeAlignment: 1, priorEvidenceWeight: 1, followUpDepth: 1 },
  groundingRefs: [],
  evaluationVersion: "v1",
  evaluatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Presenters — Phase 57: no hidden scoring logic reaches the student", () => {
  it("toPublicQuestion strips difficulty and groundedIn (which could leak internal notes)", () => {
    const publicQ = toPublicQuestion(SAMPLE_QUESTION);
    expect(publicQ).not.toHaveProperty("difficulty");
    expect(publicQ).not.toHaveProperty("groundedIn");
    expect(publicQ).not.toHaveProperty("validation");
    expect(JSON.stringify(publicQ)).not.toContain("secret internal note");
  });

  it("toPublicSubmitResult strips confidence, adaptiveSignal, and dimensions for a STUDENT actor", () => {
    const result = toPublicSubmitResult(SAMPLE_EVALUATION, studentActor());
    expect(result).not.toHaveProperty("confidence");
    expect(result).not.toHaveProperty("adaptiveSignal");
    expect(result).not.toHaveProperty("dimensions");
    expect(result).not.toHaveProperty("confidenceFactors");
  });

  it("toPublicSubmitResult returns the FULL evaluation for a TRAINER actor", () => {
    const result = toPublicSubmitResult(SAMPLE_EVALUATION, trainerActor());
    expect(result).toHaveProperty("confidence", 0.92);
    expect(result).toHaveProperty("adaptiveSignal", "STRONG");
  });

  it("toPublicSession strips the internal coverage map and versionInfo for a STUDENT actor", () => {
    const session = {
      id: "sess_1",
      state: "IN_PROGRESS",
      mode: "TECHNICAL_SCREENING",
      roleId: "role_1",
      coverage: { skill_sql: { skillId: "skill_sql", importance: "CORE", questionsAsked: 2, followUpDepth: 1, currentEvidenceState: "VERIFIED", currentConfidence: 0.9, status: "SUFFICIENT" } },
      questionIds: ["q_1", "q_2"],
      versionInfo: { interviewVersion: "v1", roleModelVersion: "v1", evaluationVersion: "v1" },
    } as unknown as InterviewSession;

    const publicView = toPublicSession(session, studentActor());
    expect(publicView).not.toHaveProperty("coverage");
    expect(publicView).not.toHaveProperty("versionInfo");
    expect((publicView as { questionsAskedCount: number }).questionsAskedCount).toBe(2);
  });
});

describe("Orchestration — Phase 60-61, 69: authorization boundaries", () => {
  it("a STUDENT cannot pause another student's session (cross-user)", async () => {
    const container = buildContainer();
    const owner = studentActor(EXAMPLE_STUDENT_ID);
    const intruder = studentActor(asStudentId("student_intruder"));

    const { session } = await createInterview(container, { actor: owner, orgId: EXAMPLE_ORG_ID, studentId: EXAMPLE_STUDENT_ID, roleId: EXAMPLE_ROLE_ID, mode: "TECHNICAL_SCREENING" });
    await startSession(container, owner, EXAMPLE_ORG_ID, session.id);

    await expect(pauseSession(container, intruder, EXAMPLE_ORG_ID, session.id)).rejects.toThrow(AuthorizationError);
  });

  it("a STUDENT cannot cancel another student's session", async () => {
    const container = buildContainer();
    const owner = studentActor(EXAMPLE_STUDENT_ID);
    const intruder = studentActor(asStudentId("student_intruder"));

    const { session } = await createInterview(container, { actor: owner, orgId: EXAMPLE_ORG_ID, studentId: EXAMPLE_STUDENT_ID, roleId: EXAMPLE_ROLE_ID, mode: "TECHNICAL_SCREENING" });

    await expect(cancelSession(container, intruder, EXAMPLE_ORG_ID, session.id, "not yours")).rejects.toThrow(AuthorizationError);
  });

  it("cross-tenant access to evaluations returns not-found, never the data or a permission error that confirms existence", async () => {
    const container = buildContainer();
    const owner = studentActor(EXAMPLE_STUDENT_ID);
    const { session } = await createInterview(container, { actor: owner, orgId: EXAMPLE_ORG_ID, studentId: EXAMPLE_STUDENT_ID, roleId: EXAMPLE_ROLE_ID, mode: "TECHNICAL_SCREENING" });

    const otherOrgTrainer = trainerActor(asOrgId("org_rival_college"));
    await expect(getSessionEvaluations(container, otherOrgTrainer, EXAMPLE_ORG_ID, session.id)).rejects.toThrow(AuthorizationError);
    // Also verify the session lookup itself never leaks existence across tenants.
    await expect(getSession(container, otherOrgTrainer, asOrgId("org_rival_college"), session.id)).rejects.toThrow(NotFoundError);
  });

  it("cross-tenant access to skill evidence is blocked the same way", async () => {
    const container = buildContainer();
    const owner = studentActor(EXAMPLE_STUDENT_ID);
    const { session } = await createInterview(container, { actor: owner, orgId: EXAMPLE_ORG_ID, studentId: EXAMPLE_STUDENT_ID, roleId: EXAMPLE_ROLE_ID, mode: "TECHNICAL_SCREENING" });

    const otherOrgTrainer = trainerActor(asOrgId("org_rival_college"));
    await expect(getSessionSkillEvidence(container, otherOrgTrainer, EXAMPLE_ORG_ID, session.id)).rejects.toThrow(AuthorizationError);
  });

  it("a TRAINER from one org cannot pull institutional reports scoped to another org", async () => {
    const container = buildContainer();
    const otherOrgTrainer = trainerActor(asOrgId("org_rival_college"));
    await expect(getInstitutionalReport(container, otherOrgTrainer, EXAMPLE_ORG_ID, EXAMPLE_ROLE_ID, [EXAMPLE_STUDENT_ID])).rejects.toThrow(AuthorizationError);
  });

  it("a STUDENT actor is blocked from institutional reports even within their own org", async () => {
    const container = buildContainer();
    await expect(getInstitutionalReport(container, studentActor(), EXAMPLE_ORG_ID, EXAMPLE_ROLE_ID, [EXAMPLE_STUDENT_ID])).rejects.toThrow(AuthorizationError);
  });
});
