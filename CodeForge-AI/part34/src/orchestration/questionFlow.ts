// ============================================================================
// Use case: request next question. This is where Phase 9 (selection), Phase
// 10-11 (generation + validation), and Phase 20-22 (adaptive follow-up,
// bounded depth) actually meet. Contract this use case relies on:
//
//   - session.currentQuestionId with NO response yet  -> re-return that same
//     question (safe to call repeatedly; supports refresh/reconnect).
//   - session.currentQuestionId WITH an OK evaluation  -> decide follow-up
//     or move to the next skill.
//   - session.currentQuestionId WITH a PENDING/FAILED evaluation -> caller
//     must retry evaluation first; we do not paper over it with a new
//     question (Phase 42).
//   - no currentQuestionId yet -> pick the very first skill.
// ============================================================================

import { updateSkillCoverage, checkCompletion } from "../engine/coverage.js";
import { selectNextSkill, type SkillCandidateInput } from "../engine/questionSelection.js";
import { generateQuestion } from "../engine/questionGeneration.js";
import { decideFollowUp, buildFollowUpPromptHint } from "../engine/followUp.js";
import type { InterviewSession, OrgId, Question, SessionId, SkillId, BlueprintSkillTarget } from "../domain/types.js";
import type { AppContainer } from "./container.js";
import { ConflictError, NotFoundError, logEvent, requireAuthorized } from "./helpers.js";

export type NextQuestionOutcome =
  | { status: "QUESTION_READY"; question: Question; session: InterviewSession }
  | { status: "AWAITING_RESPONSE"; question: Question; session: InterviewSession } // current question unanswered — same one re-returned
  | { status: "AWAITING_EVALUATION"; questionId: Question["id"]; session: InterviewSession } // last response's evaluation still pending/failed
  | { status: "READY_TO_COMPLETE"; session: InterviewSession }
  | { status: "GENERATION_FAILED"; reason: string; session: InterviewSession };

export async function requestNextQuestion(
  container: AppContainer,
  actorOrgId: OrgId,
  actor: Parameters<typeof requireAuthorized>[1],
  sessionId: SessionId,
): Promise<NextQuestionOutcome> {
  const { repositories, ports } = container;
  const session = await repositories.sessions.getById(sessionId, actorOrgId);
  if (!session) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(ports.authz, actor, "INTERVIEW_VIEW", actorOrgId, session.studentId);

  if (session.state !== "IN_PROGRESS") {
    throw new ConflictError(`Session ${sessionId} is not IN_PROGRESS (current state: ${session.state}); cannot request a question.`);
  }

  const definition = await repositories.definitions.getById(session.interviewDefinitionId, actorOrgId);
  if (!definition) throw new NotFoundError("InterviewDefinition", session.interviewDefinitionId);
  const { blueprint } = definition;

  // ---- Case: there IS a current question — check its response/evaluation --
  if (session.currentQuestionId) {
    const response = await repositories.responses.getByQuestionId(session.currentQuestionId, actorOrgId);
    if (!response) {
      const current = await repositories.questions.getById(session.currentQuestionId, actorOrgId);
      if (!current) throw new NotFoundError("Question", session.currentQuestionId);
      return { status: "AWAITING_RESPONSE", question: current, session };
    }

    const evaluation = await repositories.evaluations.getByResponseId(response.id, actorOrgId);
    if (!evaluation || evaluation.status !== "OK") {
      return { status: "AWAITING_EVALUATION", questionId: session.currentQuestionId, session };
    }

    // Evaluated OK — decide whether to go deeper on the same skill.
    const coverageEntry = session.coverage[evaluation.skillId];
    const followUpDecision = decideFollowUp({
      adaptiveSignal: evaluation.adaptiveSignal,
      followUpConfig: blueprint.followUpConfig,
      currentDepthForSkill: coverageEntry?.followUpDepth ?? 0,
    });

    if (followUpDecision.shouldAskFollowUp) {
      const parentQuestion = await repositories.questions.getById(session.currentQuestionId, actorOrgId);
      if (!parentQuestion) throw new NotFoundError("Question", session.currentQuestionId);

      const priorTexts = (await repositories.questions.listBySession(sessionId, actorOrgId)).map((q) => q.text);
      const studentEvidence = await ports.studentEvidence.getStudentEvidenceContext(session.studentId, session.roleId, actorOrgId);

      const promptHint = buildFollowUpPromptHint(parentQuestion, response, evaluation.adaptiveSignal);
      const genResult = await generateQuestion(ports.aiGateway, {
        sessionId,
        roleId: session.roleId,
        mode: session.mode,
        skillId: evaluation.skillId,
        difficulty: parentQuestion.difficulty,
        preferCodeGrounded: blueprint.questionStrategy.preferCodeGrounded,
        studentEvidence,
        priorQuestionTexts: priorTexts,
        isFollowUp: true,
        parentQuestionId: parentQuestion.id,
        followUpTrigger: evaluation.adaptiveSignal,
        extraInstruction: promptHint,
        priorQuestionCountForSkill: coverageEntry?.questionsAsked ?? 0,
      });

      if (!genResult.ok) {
        await logEvent(repositories.events, ports.observability, actorOrgId, sessionId, "question.generation_failed", genResult, "question.generation_failed");
        return { status: "GENERATION_FAILED", reason: genResult.reason, session };
      }

      await repositories.questions.save(genResult.question, actorOrgId);
      const updatedSession = await appendQuestionToSession(container, session, genResult.question, blueprint, /* isFollowUpDepthIncrement */ true);
      return { status: "QUESTION_READY", question: genResult.question, session: updatedSession };
    }

    // No follow-up warranted — fall through to selecting the next skill.
    return selectAndGenerateNext(container, actorOrgId, session, blueprint);
  }

  // ---- Case: no current question yet — this is the first question --------
  return selectAndGenerateNext(container, actorOrgId, session, blueprint);
}

async function selectAndGenerateNext(
  container: AppContainer,
  orgId: OrgId,
  session: InterviewSession,
  blueprint: NonNullable<Awaited<ReturnType<typeof container.repositories.definitions.getById>>>["blueprint"],
): Promise<NextQuestionOutcome> {
  const { repositories, ports } = container;

  const totalAsked = session.questionIds.length;
  const completion = checkCompletion(blueprint.skills, session.coverage, blueprint.completionRequirements, totalAsked);
  if (completion.isComplete) {
    return { status: "READY_TO_COMPLETE", session };
  }

  const gaps = await ports.roleSkillGap.getSkillGaps(session.studentId, session.roleId, orgId);
  const gapsBySkill = new Map(gaps.map((g) => [g.skillId, g]));
  const candidates: SkillCandidateInput[] = blueprint.skills.map((target) => ({ target, gap: gapsBySkill.get(target.skillId) }));

  const selected = selectNextSkill(candidates, session.coverage, blueprint.difficulty);
  if (!selected) {
    // Nothing left within bounds even though the formal completion check
    // hadn't fired yet (e.g. every skill hit its per-skill max). Treat as
    // ready to complete rather than erroring — this is exactly the
    // "assessment incomplete" golden case territory (Phase 73), surfaced
    // honestly in the summary rather than looping forever here.
    return { status: "READY_TO_COMPLETE", session };
  }

  const studentEvidence = await ports.studentEvidence.getStudentEvidenceContext(session.studentId, session.roleId, orgId);
  const priorTexts = (await repositories.questions.listBySession(session.id, orgId)).map((q) => q.text);

  const genResult = await generateQuestion(ports.aiGateway, {
    sessionId: session.id,
    roleId: session.roleId,
    mode: session.mode,
    skillId: selected.skillId as SkillId,
    difficulty: selected.suggestedDifficulty,
    preferCodeGrounded: blueprint.questionStrategy.preferCodeGrounded,
    studentEvidence,
    priorQuestionTexts: priorTexts,
    priorQuestionCountForSkill: session.coverage[selected.skillId as SkillId]?.questionsAsked ?? 0,
  });

  if (!genResult.ok) {
    await logEvent(repositories.events, ports.observability, orgId, session.id, "question.generation_failed", { ...genResult, skillId: selected.skillId }, "question.generation_failed");
    return { status: "GENERATION_FAILED", reason: genResult.reason, session };
  }

  await repositories.questions.save(genResult.question, orgId);
  const updatedSession = await appendQuestionToSession(container, session, genResult.question, blueprint, false);
  return { status: "QUESTION_READY", question: genResult.question, session: updatedSession };
}

async function appendQuestionToSession(
  container: AppContainer,
  session: InterviewSession,
  question: Question,
  blueprint: { skills: BlueprintSkillTarget[] },
  isFollowUpDepthIncrement: boolean,
): Promise<InterviewSession> {
  const target = blueprint.skills.find((s) => s.skillId === question.skillId);
  const previousEntry = session.coverage[question.skillId];

  const nextCoverageEntry = target
    ? updateSkillCoverage(
        target,
        previousEntry,
        1,
        isFollowUpDepthIncrement ? 1 : 0,
        previousEntry?.currentEvidenceState ?? "UNASSESSED",
        previousEntry?.currentConfidence ?? 0,
      )
    : previousEntry;

  const nextSession: InterviewSession = {
    ...session,
    questionIds: [...session.questionIds, question.id],
    currentQuestionId: question.id,
    coverage: nextCoverageEntry ? { ...session.coverage, [question.skillId]: nextCoverageEntry } : session.coverage,
  };

  const written = await container.repositories.sessions.updateWithExpectedState(nextSession, session.state);
  if (!written) throw new ConflictError(`Session ${session.id} was modified concurrently while appending a question; retry the request.`);
  return nextSession;
}
