import type {
  Blueprint,
  DiagnosticMode,
  DiagnosticQuestion,
  RawResponseInput,
  StoppingDecision,
  StudentDiagnosticProfile,
} from "../types/domain.js";
import type { DiagnosticRepository, ExplanationProvider, MistakeIntelligencePort, QuestionBankPort, StudentContext } from "../types/contracts.js";
import { nodesAtLevel } from "./blueprint.js";
import { computeEvidence } from "./evidenceQuality.js";
import { estimateAllNodes, type SkillEvidencePoint } from "./capabilityEstimator.js";
import { analyzeConsistency } from "./consistency.js";
import { selectNextQuestion, type SelectionContext } from "./questionSelection.js";
import { evaluateStoppingRule } from "./stoppingRule.js";
import { detectFatigue } from "./fatigueDetection.js";
import { buildStudentProfile } from "./studentProfileBuilder.js";

const MAX_QUESTIONS_SAFETY_CAP = 40;

export type NextStepResult =
  | { done: true; decision: StoppingDecision }
  | { done: false; question: DiagnosticQuestion; skillNodeId: string };

export class DiagnosticSessionService {
  constructor(
    private repo: DiagnosticRepository,
    private questionBank: QuestionBankPort,
    private mistakeIntelligence: MistakeIntelligencePort,
    private explanationProvider: ExplanationProvider,
  ) {}

  async startOrResume(ctx: StudentContext, blueprintId: string, mode: DiagnosticMode) {
    return this.repo.startOrResumeSession(ctx, blueprintId, mode);
  }

  private async requireBlueprintForSession(ctx: StudentContext, sessionId: string) {
    const session = await this.repo.getSessionState(ctx, sessionId);
    if (!session) return { session: null, blueprint: null };
    const blueprint = await this.repo.getBlueprint(session.blueprintId);
    return { session, blueprint };
  }

  /** Rebuilds the current skill-evidence map from scratch. Cheap at realistic
   * session sizes (Module 42) and guarantees ancestor rollups are always
   * exactly consistent with the underlying evidence — see TRUTH_TABLE.md
   * for why this beats incremental partial updates here. */
  private async currentEvidenceState(ctx: StudentContext, sessionId: string) {
    const raw = await this.repo.getSessionEvidenceRaw(ctx, sessionId);
    const bySkill = new Map<string, typeof raw>();
    for (const e of raw) {
      const arr = bySkill.get(e.skillNodeId) ?? [];
      arr.push(e);
      bySkill.set(e.skillNodeId, arr);
    }

    const evidenceBySkill = new Map<string, SkillEvidencePoint[]>();
    const consistencyFlagBySkill = new Map<string, boolean>();
    const evidenceCountBySkill = new Map<string, number>();

    for (const [skillId, points] of bySkill.entries()) {
      evidenceBySkill.set(skillId, points.map((p) => ({ isCorrect: p.isCorrect, evidenceWeight: p.evidenceWeight })));
      const chron = points.filter((p) => p.isCorrect !== null).map((p) => p.isCorrect as boolean);
      const consistency = analyzeConsistency(skillId, chron);
      consistencyFlagBySkill.set(skillId, !consistency.isConsistent);
      evidenceCountBySkill.set(skillId, chron.length);
    }

    return { evidenceBySkill, consistencyFlagBySkill, evidenceCountBySkill, raw };
  }

  async getNextStep(ctx: StudentContext, sessionId: string): Promise<NextStepResult> {
    const { session, blueprint } = await this.requireBlueprintForSession(ctx, sessionId);
    if (!session || !blueprint) throw new Error("DIAG_SESSION_NOT_FOUND");

    const { evidenceCountBySkill, raw } = await this.currentEvidenceState(ctx, sessionId);

    const fatigue = detectFatigue(
      raw.slice(-10).map((r) => ({ durationMs: r.durationMs, expectedDurationMs: r.expectedDurationMs, isCorrect: r.isCorrect })),
    );

    const stopping = evaluateStoppingRule({
      blueprint,
      evidenceCountBySkill,
      totalQuestionsAsked: session.responseCount,
      maxQuestions: MAX_QUESTIONS_SAFETY_CAP,
      fatigueDetected: fatigue.fatigueLikely,
    });

    if (stopping.shouldStop) return { done: true, decision: stopping };

    const skillEstimates = await this.repo.getSkillEstimates(ctx, sessionId);
    const snapshots = new Map(
      skillEstimates
        .filter((e) => e.nodeLevel === "skill")
        .map((e) => [e.skillNodeId, { pointEstimate: e.pointEstimate, confidenceState: e.confidenceState, evidenceCount: e.evidenceCount }]),
    );

    const candidatesBySkill = new Map<string, DiagnosticQuestion[]>();
    for (const leaf of nodesAtLevel(blueprint, "skill")) {
      candidatesBySkill.set(leaf.id, await this.questionBank.getCandidatesForSkill(leaf.id));
    }

    const allCandidateIds = [...candidatesBySkill.values()].flat().map((q) => q.id);
    const exposures = new Map<string, number>();
    for (const qid of allCandidateIds) exposures.set(qid, await this.repo.getQuestionExposure(ctx, qid));

    const ctxForSelection: SelectionContext = { skillSnapshots: snapshots, exposures };
    const result = selectNextQuestion(blueprint, candidatesBySkill, ctxForSelection);

    if (!result) {
      // Module 56: insufficient question pool — nothing left to ask, even
      // with exposure penalties. Stop rather than error.
      return { done: true, decision: { shouldStop: true, reason: "max_questions_reached" } };
    }

    return { done: false, question: result.question, skillNodeId: result.skillNodeId };
  }

  async submitResponse(ctx: StudentContext, sessionId: string, response: RawResponseInput) {
    const priorExposureCount = await this.repo.getQuestionExposure(ctx, response.questionId);
    const evidence = computeEvidence({ response, priorExposureCount });

    const { blueprint } = await this.requireBlueprintForSession(ctx, sessionId);
    if (!blueprint) return { ok: false as const, reason: "DIAG_SESSION_NOT_FOUND" };

    // Recompute the WHOLE tree from all evidence-to-date + this new point,
    // so topic/domain rollups are always exactly consistent (see
    // currentEvidenceState's doc comment).
    const { evidenceBySkill, consistencyFlagBySkill } = await this.currentEvidenceState(ctx, sessionId);
    const existingForSkill = evidenceBySkill.get(response.skillNodeId) ?? [];
    evidenceBySkill.set(response.skillNodeId, [...existingForSkill, { isCorrect: evidence.isCorrect, evidenceWeight: evidence.evidenceWeight }]);

    const updatedEstimates = estimateAllNodes(blueprint, evidenceBySkill, consistencyFlagBySkill);

    return this.repo.submitResponse(
      ctx,
      sessionId,
      response,
      { evidenceWeight: evidence.evidenceWeight, timingClassification: evidence.timingClassification, qualityFlags: evidence.qualityFlags },
      updatedEstimates,
    );
  }

  async getFatigueSignal(recentTimedResponses: { durationMs: number; expectedDurationMs: number; isCorrect: boolean | null }[]) {
    return detectFatigue(recentTimedResponses);
  }

  async pause(ctx: StudentContext, sessionId: string) {
    return this.repo.pauseSession(ctx, sessionId);
  }

  async resume(ctx: StudentContext, sessionId: string) {
    return this.repo.resumeSession(ctx, sessionId);
  }

  async abandonOrExpire(ctx: StudentContext, sessionId: string, status: "abandoned" | "expired") {
    return this.repo.abandonOrExpireSession(ctx, sessionId, status);
  }

  async complete(ctx: StudentContext, sessionId: string): Promise<{ ok: boolean; profile?: StudentDiagnosticProfile; reason?: string }> {
    const { session, blueprint } = await this.requireBlueprintForSession(ctx, sessionId);
    if (!session || !blueprint) return { ok: false, reason: "DIAG_SESSION_NOT_FOUND" };

    const raw = await this.repo.getSessionEvidenceRaw(ctx, sessionId);
    const responsesForProfile = raw.map((r) => ({
      skillNodeId: r.skillNodeId,
      isCorrect: r.isCorrect,
      durationMs: r.durationMs,
      expectedDurationMs: r.expectedDurationMs,
      difficulty: r.difficulty,
      confidence: r.confidence,
      evidenceWeight: r.evidenceWeight,
      createdAt: r.createdAt,
    }));

    const profile = buildStudentProfile({
      sessionId,
      studentId: ctx.studentId,
      blueprint,
      responses: responsesForProfile,
    });

    const result = await this.repo.completeSession(ctx, sessionId, profile);
    if (!result.ok) return { ok: false, reason: result.reason };

    await this.repo.recordRecommendations(
      ctx,
      sessionId,
      profile.recommendedNextStep.map((r) => ({
        skill_node_id: r.skillNodeId,
        priority: r.priority,
        recommended_action: r.recommendedAction,
        evidence_confidence: r.evidenceConfidence,
        rationale: r.rationale,
      })),
    );

    return { ok: true, profile };
  }

  async startReassessment(ctx: StudentContext, blueprintId: string) {
    return this.repo.startReassessment(ctx, blueprintId);
  }

  async getBaselineVsCurrent(ctx: StudentContext, sessionId: string) {
    return this.repo.getBaselineVsCurrent(ctx, sessionId);
  }

  async explainSkill(ctx: StudentContext, sessionId: string, skillNodeId: string) {
    const skillEstimates = await this.repo.getSkillEstimates(ctx, sessionId);
    const estimate = skillEstimates.find((e) => e.skillNodeId === skillNodeId);
    if (!estimate) return null;

    const trail = await this.repo.getEvidenceTrail(ctx, skillNodeId, sessionId);
    const supportingEvidence =
      trail.length === 0 ? ["We need more evidence to confidently identify the reason."] : [`${trail.length} independent response(s) recorded for this skill.`];

    return this.explanationProvider.explain({
      conclusion: `${estimate.nodeLabel}: ${estimate.status.replace("_", " ")}`,
      supportingEvidence,
      confidenceState: estimate.confidenceState,
    });
  }
}
