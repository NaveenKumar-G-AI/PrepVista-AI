import { randomUUID } from "node:crypto";
import { buildInterviewBlueprint, type BuildBlueprintInput } from "../domain/blueprint.js";
import { assertValidTransition } from "../domain/stateMachine.js";
import type {
  InterviewSession,
  InterviewQuestion,
  TenantContext,
  DepthLevel,
} from "../domain/types.js";
import type {
  RoleSkillModelPort,
  CandidateEvidencePort,
  SkillSignalEnginePort,
  AIGatewayPort,
  AuditLogPort,
  VoicePort,
} from "../integration/ports.js";
import type { InterviewRepositoryPort } from "../repository/types.js";
import { selectNextTopic } from "./questionSelection.js";
import { validateGeneratedQuestion } from "./questionValidation.js";
import { decideFollowUp } from "./adaptiveFollowUp.js";
import { buildCoverageReport, decideStop } from "./coverageTracker.js";
import { extractSkillEvidence } from "./evidenceExtraction.js";
import { runEvaluationPipeline } from "./evaluationPipeline.js";
import { deriveSkillProgress, recentSkillsMostRecentFirst, analyzeCurrentTopic } from "./sessionProgress.js";

export type SubmitResponseResult =
  | { status: "NEXT_QUESTION"; question: InterviewQuestion; session: InterviewSession }
  | { status: "COMPLETED"; session: InterviewSession; coverage: ReturnType<typeof buildCoverageReport> }
  | { status: "EVALUATION_FAILED"; session: InterviewSession; message: string }
  | { status: "DUPLICATE_IGNORED"; session: InterviewSession; question: InterviewQuestion | null };

export interface OrchestratorDeps {
  repo: InterviewRepositoryPort;
  roleSkillModel: RoleSkillModelPort;
  candidateEvidence: CandidateEvidencePort;
  skillSignalEngine: SkillSignalEnginePort;
  aiGateway: AIGatewayPort;
  auditLog: AuditLogPort;
  voice: VoicePort;
}

export class InterviewOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  // ---------------------------------------------------------------------
  // §8-9 creation
  // ---------------------------------------------------------------------
  async createInterview(
    ctx: TenantContext,
    input: {
      candidateId: string;
      targetRole: string;
      mode: BuildBlueprintInput["mode"];
      restrictToSkills?: string[];
      overrides?: BuildBlueprintInput["overrides"];
    }
  ): Promise<InterviewSession> {
    const roleSkillRequirements = await this.deps.roleSkillModel.getRoleSkillRequirements(ctx.orgId, input.targetRole);
    const blueprint = buildInterviewBlueprint({
      orgId: ctx.orgId,
      targetRole: input.targetRole,
      mode: input.mode,
      createdBy: ctx.actorId,
      roleSkillRequirements,
      restrictToSkills: input.restrictToSkills,
      overrides: input.overrides,
    });
    await this.deps.repo.createBlueprint(blueprint);

    const session = await this.deps.repo.createSession({
      id: randomUUID(),
      orgId: ctx.orgId,
      blueprintId: blueprint.id,
      blueprintVersion: blueprint.version,
      candidateId: input.candidateId,
      state: "CREATED",
      currentQuestionId: null,
      startedAt: null,
      pausedAt: null,
      resumedAt: null,
      completedAt: null,
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await this.audit(ctx, session.id, "INTERVIEW_CREATED", { targetRole: input.targetRole, mode: input.mode });
    return session;
  }

  // ---------------------------------------------------------------------
  // §37 CREATED -> READY -> IN_PROGRESS, then the first question
  // ---------------------------------------------------------------------
  async startSession(ctx: TenantContext, sessionId: string): Promise<{ session: InterviewSession; question: InterviewQuestion }> {
    let session = await this.requireSession(ctx, sessionId);
    assertValidTransition(session.state, "READY");
    session = await this.deps.repo.updateSession(ctx.orgId, sessionId, { ...session, state: "READY" });
    assertValidTransition(session.state, "IN_PROGRESS");
    session = await this.deps.repo.updateSession(ctx.orgId, sessionId, { ...session, state: "IN_PROGRESS" });

    await this.audit(ctx, sessionId, "SESSION_STARTED", {});

    const question = await this.selectAndPersistNewTopicQuestion(ctx, session);
    if (!question) {
      throw new Error("blueprint produced zero target skills — cannot start an interview with no topics");
    }
    return { session, question };
  }

  async getCurrentQuestion(ctx: TenantContext, sessionId: string): Promise<InterviewQuestion | null> {
    const session = await this.requireSession(ctx, sessionId);
    if (!session.currentQuestionId) return null;
    return this.deps.repo.getQuestion(ctx.orgId, session.currentQuestionId);
  }

  // ---------------------------------------------------------------------
  // §39 idempotent core loop: evaluate -> decide -> follow up or move on
  // ---------------------------------------------------------------------
  async submitResponse(
    ctx: TenantContext,
    input: { sessionId: string; questionId: string; responseText: string; idempotencyKey: string }
  ): Promise<SubmitResponseResult> {
    let session = await this.requireSession(ctx, input.sessionId);

    if (session.state === "RESUMED") {
      assertValidTransition(session.state, "IN_PROGRESS");
      session = await this.deps.repo.updateSession(ctx.orgId, session.id, { ...session, state: "IN_PROGRESS" });
    }
    if (session.state !== "IN_PROGRESS") {
      throw new Error(`cannot submit a response while session is in state ${session.state}`);
    }

    const { response, wasDuplicate } = await this.deps.repo.addResponseIdempotent({
      id: randomUUID(),
      sessionId: input.sessionId,
      questionId: input.questionId,
      candidateId: session.candidateId,
      responseText: input.responseText,
      submittedAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey,
    });

    if (wasDuplicate) {
      // §39 — a retried request must not re-run evaluation or generate a
      // second follow-up question. Whatever the first successful call
      // already decided is still sitting on the session; just report it.
      const current = await this.requireSession(ctx, input.sessionId);
      const q = current.currentQuestionId ? await this.deps.repo.getQuestion(ctx.orgId, current.currentQuestionId) : null;
      return { status: "DUPLICATE_IGNORED", session: current, question: q };
    }

    const blueprint = await this.requireBlueprint(ctx, session.blueprintId);
    const question = await this.deps.repo.getQuestion(ctx.orgId, input.questionId);
    if (!question) throw new Error(`question ${input.questionId} not found`);

    const evidenceBundle = await this.deps.candidateEvidence.getExistingEvidence(ctx.orgId, session.candidateId, [question.skill]);
    const evidenceForQuestion = question.evidenceRef
      ? evidenceBundle.bySkill[question.skill]?.find((e) => e.artifactId === question.evidenceRef!.artifactId)
      : undefined;

    const result = await runEvaluationPipeline({
      aiGateway: this.deps.aiGateway,
      orgId: ctx.orgId,
      role: blueprint.targetRole,
      question,
      responseText: input.responseText,
      evidence: evidenceForQuestion,
      dimensions: blueprint.evaluationRules.dimensions,
    });

    if (!result.ok) {
      // §45 — AI failure becomes EVALUATION_PENDING -> EVALUATION_FAILED, never a bad grade.
      assertValidTransition(session.state, "EVALUATION_PENDING");
      session = await this.deps.repo.updateSession(ctx.orgId, session.id, { ...session, state: "EVALUATION_PENDING" });
      assertValidTransition(session.state, "EVALUATION_FAILED");
      session = await this.deps.repo.updateSession(ctx.orgId, session.id, { ...session, state: "EVALUATION_FAILED" });
      await this.audit(ctx, session.id, "EVALUATION_FAILED", { questionId: question.id, error: result.error });
      return { status: "EVALUATION_FAILED", session, message: result.error };
    }

    const evaluation = await this.deps.repo.addEvaluation({
      id: randomUUID(),
      responseId: response.id,
      evaluationVersion: 1,
      ...result.value,
    });
    await this.audit(ctx, session.id, "EVALUATION_CREATED", {
      questionId: question.id,
      answerQuality: evaluation.answerQuality,
      consistency: evaluation.consistency,
    });

    return this.advanceAfterEvaluation(ctx, session, blueprint, question);
  }

  // ---------------------------------------------------------------------
  // §34-36 voice input — same pipeline, with a mandatory safe fallback
  // ---------------------------------------------------------------------
  async submitVoiceResponse(
    ctx: TenantContext,
    input: { sessionId: string; questionId: string; audio: Uint8Array; idempotencyKey: string }
  ): Promise<SubmitResponseResult | { status: "VOICE_FAILED_FALLBACK_TO_TEXT" }> {
    const transcription = await this.deps.voice.speechToText(input.audio);
    if (!transcription) {
      await this.audit(ctx, input.sessionId, "VOICE_FAILURE_FALLBACK", { questionId: input.questionId });
      return { status: "VOICE_FAILED_FALLBACK_TO_TEXT" };
    }
    return this.submitResponse(ctx, { ...input, responseText: transcription.text });
  }

  // ---------------------------------------------------------------------
  // §38 pause/resume/recovery
  // ---------------------------------------------------------------------
  async pause(ctx: TenantContext, sessionId: string): Promise<InterviewSession> {
    const session = await this.requireSession(ctx, sessionId);
    assertValidTransition(session.state, "PAUSED");
    const updated = await this.deps.repo.updateSession(ctx.orgId, sessionId, { ...session, state: "PAUSED" });
    await this.audit(ctx, sessionId, "SESSION_PAUSED", {});
    return updated;
  }

  async resume(ctx: TenantContext, sessionId: string): Promise<{ session: InterviewSession; question: InterviewQuestion | null }> {
    const session = await this.requireSession(ctx, sessionId);
    assertValidTransition(session.state, "RESUMED");
    const updated = await this.deps.repo.updateSession(ctx.orgId, sessionId, { ...session, state: "RESUMED" });
    await this.audit(ctx, sessionId, "SESSION_RESUMED", {});
    const question = updated.currentQuestionId ? await this.deps.repo.getQuestion(ctx.orgId, updated.currentQuestionId) : null;
    return { session: updated, question };
  }

  async getHistory(ctx: TenantContext, candidateId: string): Promise<InterviewSession[]> {
    return this.deps.repo.listSessionsForCandidate(ctx.orgId, candidateId);
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async advanceAfterEvaluation(
    ctx: TenantContext,
    session: InterviewSession,
    blueprint: Awaited<ReturnType<InterviewOrchestrator["requireBlueprint"]>>,
    answeredQuestion: InterviewQuestion
  ): Promise<SubmitResponseResult> {
    const allQuestions = await this.deps.repo.listQuestions(ctx.orgId, session.id);
    const allResponses = await this.deps.repo.listResponses(ctx.orgId, session.id);
    const allEvaluations = await this.deps.repo.listEvaluations(ctx.orgId, session.id);

    const responsesByQuestionId = new Map(allResponses.map((r) => [r.questionId, r]));
    const evaluationByResponseId = new Map(allEvaluations.map((e) => [e.responseId, e]));
    const progress = deriveSkillProgress(allQuestions, responsesByQuestionId, evaluationByResponseId);

    const topicState = analyzeCurrentTopic(allQuestions);
    const latestResponse = responsesByQuestionId.get(answeredQuestion.id)!;
    const latestEvaluation = evaluationByResponseId.get(latestResponse.id)!;

    const decision = decideFollowUp({
      blueprint,
      currentDepthLevel: topicState!.depthLevel,
      followUpsSoFarForTopic: topicState!.followUpsSoFarForTopic,
      retriesAtCurrentDepth: topicState!.retriesAtCurrentDepth,
      evaluation: latestEvaluation,
    });

    // §28 hard resource caps (question/time budget) apply unconditionally —
    // even to a follow-up chain that's still earning "go deeper" verdicts —
    // because decideFollowUp never itself looks at the session-wide budget.
    const coverage = buildCoverageReport(blueprint, progress);
    const elapsedMinutes = session.startedAt ? (Date.now() - new Date(session.startedAt).getTime()) / 60000 : 0;
    const budgetExceeded =
      allQuestions.length >= blueprint.timeConfig.maxQuestions || elapsedMinutes >= blueprint.timeConfig.maxDurationMinutes;
    if (budgetExceeded) {
      const completedSession = await this.completeInterview(ctx, session, blueprint, progress, coverage);
      return { status: "COMPLETED", session: completedSession, coverage };
    }

    if (decision.action !== "NEW_TOPIC") {
      const followUp = await this.generateAndPersistFollowUp(ctx, session, blueprint, answeredQuestion, decision.nextDepthLevel!, decision.reason!, allQuestions);
      return { status: "NEXT_QUESTION", question: followUp, session };
    }

    // Topic exhausted (either answered well enough to close it out, or its
    // own budget/ladder exhausted). ONLY now — when we'd otherwise go look
    // for a brand-new topic — does "coverage is already sufficient" become
    // a valid reason to stop; it must never cut off a follow-up chain that
    // decideFollowUp is still actively deepening, or the ladder in §27
    // could never actually be exercised.
    const stopDecision = decideStop(blueprint, coverage, allQuestions.length, elapsedMinutes);
    if (stopDecision.shouldStop) {
      const completedSession = await this.completeInterview(ctx, session, blueprint, progress, coverage);
      return { status: "COMPLETED", session: completedSession, coverage };
    }

    const recentSkills = recentSkillsMostRecentFirst(allQuestions, blueprint.questionStrategy.diversityWindow);
    const alreadyRootedSkills = new Set(Object.keys(progress).filter((s) => progress[s]!.questionsAsked > 0));
    const evidenceBundle = await this.deps.candidateEvidence.getExistingEvidence(
      ctx.orgId,
      session.candidateId,
      blueprint.targetSkills.map((s) => s.skill)
    );
    const topic = selectNextTopic(blueprint, coverage.perSkill, evidenceBundle, recentSkills, alreadyRootedSkills);
    if (!topic) {
      // No topic left to start: either every skill is SUFFICIENTLY_ASSESSED,
      // or every remaining skill has already had its one root chain this
      // session and simply never reached sufficient confidence. The second
      // case is a genuinely incomplete interview (§29) and completeInterview
      // -> buildCoverageReport reports it as such (isComplete: false) rather
      // than this branch pretending otherwise — there's just nothing left
      // this orchestrator can still ask.
      const completedSession = await this.completeInterview(ctx, session, blueprint, progress, coverage);
      return { status: "COMPLETED", session: completedSession, coverage };
    }

    const nextQuestion = await this.generateAndPersistRootQuestion(ctx, session, blueprint, topic, allQuestions);
    return { status: "NEXT_QUESTION", question: nextQuestion, session };
  }

  private async completeInterview(
    ctx: TenantContext,
    session: InterviewSession,
    blueprint: Awaited<ReturnType<InterviewOrchestrator["requireBlueprint"]>>,
    progress: ReturnType<typeof deriveSkillProgress>,
    coverage: ReturnType<typeof buildCoverageReport>
  ): Promise<InterviewSession> {
    const evidenceRecords = extractSkillEvidence(progress);
    for (const record of evidenceRecords) {
      await this.deps.repo.addSkillEvidence(ctx.orgId, session.id, session.candidateId, [record]);
    }
    // §43/§47 — Feature 35's only output to the rest of CodeForge: emit
    // evidence. It never touches mastery/readiness/gap state itself.
    await this.deps.skillSignalEngine.submitInterviewEvidence({
      orgId: ctx.orgId,
      candidateId: session.candidateId,
      sessionId: session.id,
      evidence: evidenceRecords,
    });

    assertValidTransition(session.state, "COMPLETED");
    const updated = await this.deps.repo.updateSession(ctx.orgId, session.id, { ...session, state: "COMPLETED" });
    await this.audit(ctx, session.id, "INTERVIEW_COMPLETED", {
      coverageComplete: coverage.isComplete,
      sufficientlyAssessed: coverage.sufficientlyAssessed,
      unassessed: coverage.unassessed,
    });
    return updated;
  }

  private async selectAndPersistNewTopicQuestion(ctx: TenantContext, session: InterviewSession): Promise<InterviewQuestion | null> {
    const blueprint = await this.requireBlueprint(ctx, session.blueprintId);
    const evidenceBundle = await this.deps.candidateEvidence.getExistingEvidence(
      ctx.orgId,
      session.candidateId,
      blueprint.targetSkills.map((s) => s.skill)
    );
    const emptyCoverage: Record<string, "UNASSESSED"> = {};
    for (const s of blueprint.targetSkills) emptyCoverage[s.skill] = "UNASSESSED";
    const topic = selectNextTopic(blueprint, emptyCoverage, evidenceBundle, []);
    if (!topic) return null;
    return this.generateAndPersistRootQuestion(ctx, session, blueprint, topic, []);
  }

  private async generateAndPersistRootQuestion(
    ctx: TenantContext,
    session: InterviewSession,
    blueprint: Awaited<ReturnType<InterviewOrchestrator["requireBlueprint"]>>,
    topic: ReturnType<typeof selectNextTopic> extends infer T ? NonNullable<T> : never,
    existingQuestions: InterviewQuestion[]
  ): Promise<InterviewQuestion> {
    return this.generateValidatedQuestion(ctx, session, blueprint, {
      skill: topic.skill,
      questionType: topic.questionType,
      difficulty: topic.difficulty,
      depthLevel: "DEFINITION",
      evidence: topic.evidence,
      parentQuestionId: undefined,
      followUpReason: undefined,
      existingQuestions,
    });
  }

  private async generateAndPersistFollowUp(
    ctx: TenantContext,
    session: InterviewSession,
    blueprint: Awaited<ReturnType<InterviewOrchestrator["requireBlueprint"]>>,
    parent: InterviewQuestion,
    depthLevel: DepthLevel,
    reason: NonNullable<ReturnType<typeof decideFollowUp>["reason"]>,
    existingQuestions: InterviewQuestion[]
  ): Promise<InterviewQuestion> {
    const evidenceBundle = await this.deps.candidateEvidence.getExistingEvidence(ctx.orgId, session.candidateId, [parent.skill]);
    const evidence = parent.evidenceRef
      ? evidenceBundle.bySkill[parent.skill]?.find((e) => e.artifactId === parent.evidenceRef!.artifactId)
      : undefined;

    return this.generateValidatedQuestion(ctx, session, blueprint, {
      skill: parent.skill,
      questionType: reason === "EVIDENCE_CHECK" ? "VERIFICATION" : parent.questionType,
      difficulty: parent.difficulty,
      depthLevel,
      evidence,
      parentQuestionId: parent.id,
      followUpReason: reason,
      existingQuestions,
    });
  }

  private async generateValidatedQuestion(
    ctx: TenantContext,
    session: InterviewSession,
    blueprint: Awaited<ReturnType<InterviewOrchestrator["requireBlueprint"]>>,
    spec: {
      skill: string;
      questionType: InterviewQuestion["questionType"];
      difficulty: InterviewQuestion["difficulty"];
      depthLevel: DepthLevel;
      evidence?: { artifactId: string; sourceType: string; summary: string; content?: string };
      parentQuestionId?: string;
      followUpReason?: NonNullable<ReturnType<typeof decideFollowUp>["reason"]>;
      existingQuestions: InterviewQuestion[];
    }
  ): Promise<InterviewQuestion> {
    const genInput = {
      orgId: ctx.orgId,
      role: blueprint.targetRole,
      skill: spec.skill,
      questionType: spec.questionType,
      difficulty: spec.difficulty,
      depthLevel: spec.depthLevel,
      followUpReason: spec.followUpReason,
      evidence: spec.evidence,
      previousQuestions: spec.existingQuestions.map((q) => q.promptText),
      previousAnswerSummaries: [] as string[],
    };

    let draft = await this.deps.aiGateway.generateQuestion(genInput);
    let validation = validateGeneratedQuestion(genInput, draft, genInput.previousQuestions);

    if (!validation.valid) {
      await this.audit(ctx, session.id, "QUESTION_REJECTED", { problems: validation.problems, skill: spec.skill });
      // §17 — one regeneration attempt with the same grounded context; if it fails again, surface the failure rather than silently showing an invalid question.
      draft = await this.deps.aiGateway.generateQuestion(genInput);
      validation = validateGeneratedQuestion(genInput, draft, genInput.previousQuestions);
      if (!validation.valid) {
        throw new Error(`question generation failed validation twice: ${validation.problems.join("; ")}`);
      }
    }

    const persisted = await this.deps.repo.addQuestion({
      id: randomUUID(),
      sessionId: session.id,
      sequenceNumber: spec.existingQuestions.length + 1,
      questionType: draft.questionType,
      skill: draft.skill,
      difficulty: draft.difficulty,
      depthLevel: spec.depthLevel,
      promptText: draft.promptText,
      evidenceRef: spec.evidence ? { sourceType: spec.evidence.sourceType as any, artifactId: spec.evidence.artifactId } : undefined,
      generatedBy: "AI",
      parentQuestionId: spec.parentQuestionId,
      followUpReason: spec.followUpReason,
    });

    await this.audit(ctx, session.id, "QUESTION_PRESENTED", { questionId: persisted.id, skill: persisted.skill, depthLevel: spec.depthLevel });
    return persisted;
  }

  private async requireSession(ctx: TenantContext, sessionId: string): Promise<InterviewSession> {
    const session = await this.deps.repo.getSession(ctx.orgId, sessionId);
    if (!session) throw new Error(`session ${sessionId} not found in org ${ctx.orgId}`);
    if (ctx.actorRole === "CANDIDATE" && session.candidateId !== ctx.actorId) {
      throw new Error(`candidate ${ctx.actorId} is not the owner of session ${sessionId}`);
    }
    return session;
  }

  private async requireBlueprint(ctx: TenantContext, blueprintId: string) {
    const blueprint = await this.deps.repo.getBlueprint(ctx.orgId, blueprintId);
    if (!blueprint) throw new Error(`blueprint ${blueprintId} not found in org ${ctx.orgId}`);
    return blueprint;
  }

  private async audit(ctx: TenantContext, sessionId: string | null, eventType: string, metadata: Record<string, unknown>) {
    await this.deps.auditLog.record({
      orgId: ctx.orgId,
      sessionId,
      eventType,
      actor: ctx.actorRole === "CANDIDATE" ? "CANDIDATE" : "SYSTEM",
      metadata,
    });
  }
}
