import { RecallRepository, nextId } from '../db/repository';
import { assessRetention, classifyFailureType } from '../engine/retentionEngine';
import { buildRecoveryPlan, gradeAnswers } from '../engine/recoveryEngine';
import { computeMemoryPriorities, MemoryPrioritiesResult } from '../engine/priorityEngine';
import { explainRetention } from '../engine/explanationEngine';
import { toPublicQuestion, getQuestionsById, getQuestionsForSkill } from '../engine/questionBank';
import { buildPathfinderSignal, PathfinderSignal } from '../integrations/pathfinder';
import { buildProofEvidence, ProofRetentionEvidence } from '../integrations/proof';
import { recallEventBus } from '../events/eventBus';
import {
  RetentionAssessment,
  RetentionEvidence,
  RecoverySession,
  EvidenceSource,
  QuestionType,
  Difficulty,
} from '../types';
import { APP_CONFIG } from '../config';

export class RecallService {
  constructor(private repo: RecallRepository) {}

  private skillName(skillId: string): string {
    return this.repo.getSkillMeta(skillId)?.name ?? skillId;
  }

  private targetImportance(studentId: string, skillId: string): number {
    return this.repo.getTarget(studentId)?.skillImportance[skillId] ?? 0.5;
  }

  /** Recomputes and persists an assessment, logging a transition + emitting events if the state changed. */
  private recompute(studentId: string, skillId: string): RetentionAssessment {
    const evidence = this.repo.getEvidence(studentId, skillId);
    const sessions = this.repo.getRecoverySessions(studentId, skillId);
    const previous = this.repo.getAssessment(studentId, skillId);

    const next = assessRetention({
      studentId,
      skillId,
      evidence,
      recoverySessions: sessions,
      targetImportance: this.targetImportance(studentId, skillId),
    });

    this.repo.saveAssessment(next);
    recallEventBus.emitRecall('RETENTION_RECALCULATED', { studentId, skillId, memoryState: next.memoryState });

    if (!previous || previous.memoryState !== next.memoryState) {
      this.repo.addTransition({
        studentId,
        skillId,
        from: previous?.memoryState ?? null,
        to: next.memoryState,
        timestamp: new Date().toISOString(),
        reason: next.explanationKey,
      });
      recallEventBus.emitRecall('MEMORY_STATE_CHANGED', { studentId, skillId, from: previous?.memoryState ?? null, to: next.memoryState });
    }
    recallEventBus.emitRecall('ASSESSMENT_COMPLETED', { studentId, skillId, memoryState: next.memoryState });
    return next;
  }

  // ---------------------------------------------------------------
  // Read APIs
  // ---------------------------------------------------------------

  getMemoryProfile(studentId: string) {
    const skillIds = this.repo.getSkillIdsForStudent(studentId);
    const assessments = skillIds.map((id) => this.recompute(studentId, id));
    const health = {
      strong: assessments.filter((a) => a.memoryState === 'STABLE' || a.memoryState === 'MASTERED').length,
      needsAttention: assessments.filter((a) => a.memoryState === 'AT_RISK' || a.memoryState === 'DECAYING').length,
      recurring: assessments.filter((a) => a.recurringWeakness).length,
      atRiskCritical: assessments.filter((a) => a.memoryState === 'FORGOTTEN').length,
    };
    return { studentId, assessments: this.withNames(assessments), memoryHealth: health };
  }

  getRetentionState(studentId: string, skillId: string) {
    return this.withName(this.recompute(studentId, skillId));
  }

  getRetentionHistory(studentId: string, skillId: string) {
    return {
      evidence: this.repo.getEvidence(studentId, skillId),
      transitions: this.repo.getTransitions(studentId, skillId),
      recoverySessions: this.repo.getRecoverySessions(studentId, skillId),
    };
  }

  getMemoryPriorities(studentId: string): MemoryPrioritiesResult {
    const skillIds = this.repo.getSkillIdsForStudent(studentId);
    const assessments = skillIds.map((id) => this.recompute(studentId, id));
    const target = this.repo.getTarget(studentId);
    return computeMemoryPriorities({
      assessments: this.withNames(assessments),
      targetImportanceBySkill: target?.skillImportance ?? {},
      criticalSkillIds: target?.criticalSkillIds,
    });
  }

  async getExplanation(studentId: string, skillId: string): Promise<{ explanation: string; assessment: RetentionAssessment }> {
    const assessment = this.recompute(studentId, skillId);
    const priorAttempts = this.repo.getRecoverySessions(studentId, skillId).length;
    const explanation = await explainRetention(assessment, this.skillName(skillId), priorAttempts);
    return { explanation, assessment };
  }

  getPathfinderSignal(studentId: string): PathfinderSignal {
    const skillIds = this.repo.getSkillIdsForStudent(studentId);
    const assessments = skillIds.map((id) => this.recompute(studentId, id));
    const target = this.repo.getTarget(studentId);
    const priorities = computeMemoryPriorities({
      assessments: this.withNames(assessments),
      targetImportanceBySkill: target?.skillImportance ?? {},
      criticalSkillIds: target?.criticalSkillIds,
    }).priorities;

    const recommendedRecovery: PathfinderSignal['recommendedRecovery'] = {};
    assessments.forEach((a) => {
      if (a.memoryState === 'AT_RISK' || a.memoryState === 'DECAYING' || a.memoryState === 'FORGOTTEN') {
        const evidence = this.repo.getEvidence(studentId, a.skillId);
        const failureType = classifyFailureType(evidence);
        recommendedRecovery[a.skillId] = buildRecoveryPlan(a.skillId, failureType, a.escalationLevel).interventionType;
      } else {
        recommendedRecovery[a.skillId] = null;
      }
    });

    const signal = buildPathfinderSignal(studentId, assessments, priorities, recommendedRecovery);
    recallEventBus.emitRecall('PATHFINDER_UPDATED', { studentId });
    return signal;
  }

  getProofEvidence(studentId: string, skillId: string): ProofRetentionEvidence {
    const assessment = this.recompute(studentId, skillId);
    recallEventBus.emitRecall('READINESS_UPDATED', { studentId, skillId });
    return buildProofEvidence(assessment);
  }

  listSkills() {
    return this.repo.getAllSkillMeta();
  }

  // ---------------------------------------------------------------
  // Write APIs — the client can only ever submit evidence/answers.
  // It can never set retentionStatus, memoryRisk, or readiness
  // directly (spec section 60); those are always server-computed.
  // ---------------------------------------------------------------

  recordRawEvidence(input: {
    studentId: string;
    skillId: string;
    source: EvidenceSource;
    difficulty: Difficulty;
    questionType: QuestionType;
    performance: number;
    timeTakenSeconds?: number;
    context?: string;
    /** Only honored when APP_CONFIG.DEMO_MODE is true — lets the demo
     * simulate a delayed check without waiting real days. A production
     * deployment should set DEMO_MODE=false and always use server time. */
    simulatedDaysAgo?: number;
  }): RetentionAssessment {
    const timestamp =
      APP_CONFIG.DEMO_MODE && input.simulatedDaysAgo
        ? new Date(Date.now() - input.simulatedDaysAgo * 86_400_000).toISOString()
        : new Date().toISOString();

    const evidence: RetentionEvidence = {
      id: nextId('ev'),
      studentId: input.studentId,
      skillId: input.skillId,
      timestamp,
      source: input.source,
      difficulty: input.difficulty,
      questionType: input.questionType,
      performance: input.performance,
      timeTakenSeconds: input.timeTakenSeconds,
      context: input.context,
    };
    this.repo.addEvidence(evidence);
    recallEventBus.emitRecall('EVIDENCE_CREATED', { studentId: input.studentId, skillId: input.skillId, source: input.source });
    return this.recompute(input.studentId, input.skillId);
  }

  /** GET-style "what should happen next" — creates a new recovery session
   * if none is open, or returns the existing open one. */
  async getRecoveryRecommendation(studentId: string, skillId: string) {
    const openSession = this.repo
      .getRecoverySessions(studentId, skillId)
      .find((s) => s.status === 'IN_PROGRESS' || s.status === 'AWAITING_DELAYED_VERIFICATION');

    const evidence = this.repo.getEvidence(studentId, skillId);
    const assessment = this.recompute(studentId, skillId);

    if (openSession && openSession.status === 'AWAITING_DELAYED_VERIFICATION') {
      const questions = getQuestionsById(this.sampleQuestionIds(skillId, 2));
      const { explanation } = await this.getExplanation(studentId, skillId);
      return {
        mode: 'DELAYED_VERIFICATION' as const,
        session: openSession,
        questions: questions.map(toPublicQuestion),
        explanation,
        failureType: openSession.failureType,
        interventionType: openSession.interventionType,
      };
    }

    if (openSession) {
      const questions = getQuestionsById(this.questionIdsForSkill(skillId));
      const { explanation } = await this.getExplanation(studentId, skillId);
      return {
        mode: 'RECOVERY' as const,
        session: openSession,
        questions: questions.map(toPublicQuestion),
        explanation,
        failureType: openSession.failureType,
        interventionType: openSession.interventionType,
      };
    }

    const failureType = classifyFailureType(evidence);
    const plan = buildRecoveryPlan(skillId, failureType, assessment.escalationLevel);
    const recentDelayed = evidence.filter((e) => e.performance != null).slice(-2);
    const beforeScore = recentDelayed.length ? recentDelayed[recentDelayed.length - 1].performance : null;

    const session: RecoverySession = {
      id: nextId('rs'),
      studentId,
      skillId,
      createdAt: new Date().toISOString(),
      failureType: plan.failureType,
      interventionType: plan.interventionType,
      escalationLevel: assessment.escalationLevel,
      status: 'IN_PROGRESS',
      beforeScore,
      immediateScore: null,
      delayedScore: null,
      delayedVerificationAt: null,
    };
    this.repo.addRecoverySession(session);
    recallEventBus.emitRecall('RECOVERY_REQUIRED', { studentId, skillId, failureType, interventionType: plan.interventionType });

    // Important: explain the PRE-recovery diagnosis (why this appeared),
    // using the assessment computed above before this session existed —
    // NOT a fresh recompute, which would now see its own just-created
    // session and describe "you're mid-recovery" instead of the reason
    // the recovery was triggered in the first place.
    const priorAttempts = this.repo.getRecoverySessions(studentId, skillId).length - 1;
    const explanation = await explainRetention(assessment, this.skillName(skillId), Math.max(priorAttempts, 0));
    return {
      mode: 'RECOVERY' as const,
      session,
      questions: plan.questions.map(toPublicQuestion),
      explanation,
      failureType: plan.failureType,
      interventionType: plan.interventionType,
      contentAuthored: plan.contentAuthored,
    };
  }

  submitRecoveryResult(input: { studentId: string; sessionId: string; answers: { questionId: string; selectedOptionId: string }[] }) {
    const session = this.repo.getRecoverySession(input.sessionId);
    if (!session) throw new Error('Recovery session not found');
    const questions = getQuestionsById(input.answers.map((a) => a.questionId));
    const graded = gradeAnswers(questions, input.answers);

    this.repo.updateRecoverySession(session.id, { status: 'AWAITING_DELAYED_VERIFICATION', immediateScore: graded.score });
    this.repo.addEvidence({
      id: nextId('ev'),
      studentId: input.studentId,
      skillId: session.skillId,
      timestamp: new Date().toISOString(),
      source: 'recovery_immediate_verification',
      difficulty: 'medium',
      questionType: 'application',
      performance: graded.score,
    });

    recallEventBus.emitRecall('RECOVERY_COMPLETED', { studentId: input.studentId, skillId: session.skillId, score: graded.score });
    recallEventBus.emitRecall('VERIFICATION_SCHEDULED', { studentId: input.studentId, skillId: session.skillId });

    const assessment = this.recompute(input.studentId, session.skillId);
    return { ...graded, beforeScore: session.beforeScore, assessment: this.withName(assessment) };
  }

  submitDelayedVerification(input: {
    studentId: string;
    sessionId: string;
    answers: { questionId: string; selectedOptionId: string }[];
    simulatedDaysLater?: number;
  }) {
    const session = this.repo.getRecoverySession(input.sessionId);
    if (!session) throw new Error('Recovery session not found');
    const questions = getQuestionsById(input.answers.map((a) => a.questionId));
    const graded = gradeAnswers(questions, input.answers);

    const timestamp =
      APP_CONFIG.DEMO_MODE && input.simulatedDaysLater
        ? new Date(Date.now() + input.simulatedDaysLater * 86_400_000).toISOString()
        : new Date().toISOString();

    this.repo.addEvidence({
      id: nextId('ev'),
      studentId: input.studentId,
      skillId: session.skillId,
      timestamp,
      source: 'recovery_delayed_verification',
      difficulty: 'medium',
      questionType: 'recall',
      performance: graded.score,
    });

    // Decide verified/failed from the RAW classification the new evidence
    // implies, evaluated with this session provisionally marked resolved.
    // Recomputing normally at this point would still see the session as
    // AWAITING_DELAYED_VERIFICATION (we haven't updated it yet) and force
    // memoryState to RECOVERING, which would make `verified` false no
    // matter how well the student just did — that was a real bug caught
    // during manual smoke-testing (see backend README "Known fixes").
    const evidenceNow = this.repo.getEvidence(input.studentId, session.skillId);
    const sessionsNow = this.repo.getRecoverySessions(input.studentId, session.skillId);
    const provisionalSessions = sessionsNow.map((s) =>
      s.id === session.id ? { ...s, status: 'VERIFIED_STABLE' as const, delayedScore: graded.score, delayedVerificationAt: timestamp } : s,
    );
    const rawAssessment = assessRetention({
      studentId: input.studentId,
      skillId: session.skillId,
      evidence: evidenceNow,
      recoverySessions: provisionalSessions,
      targetImportance: this.targetImportance(input.studentId, session.skillId),
    });
    const verified = rawAssessment.memoryState === 'STABLE' || rawAssessment.memoryState === 'MASTERED';

    this.repo.updateRecoverySession(session.id, {
      status: verified ? 'VERIFIED_STABLE' : 'VERIFICATION_FAILED',
      delayedScore: graded.score,
      delayedVerificationAt: timestamp,
    });

    recallEventBus.emitRecall('VERIFICATION_COMPLETED', { studentId: input.studentId, skillId: session.skillId, verified });

    // Re-fetch: status change on the session can affect currentRecoveryStatus in the assessment.
    const finalAssessment = this.recompute(input.studentId, session.skillId);
    return { ...graded, verified, assessment: this.withName(finalAssessment) };
  }

  // ---------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------

  private questionIdsForSkill(skillId: string): string[] {
    return getQuestionsForSkill(skillId).map((q) => q.id);
  }

  /** For a delayed check we don't need the full 4-step walkthrough again —
   * a couple of quick recall/verify-style questions is enough to confirm
   * whether it stuck (spec section 19: "minimum effective intervention"). */
  private sampleQuestionIds(skillId: string, count: number): string[] {
    const all = getQuestionsForSkill(skillId);
    const verifyFirst = [...all].sort((a, b) => (a.stepRole === 'verify' ? -1 : 0) - (b.stepRole === 'verify' ? -1 : 0));
    return verifyFirst.slice(0, count).map((q) => q.id);
  }

  private withName(a: RetentionAssessment): RetentionAssessment & { skillName: string } {
    return { ...a, skillName: this.skillName(a.skillId) };
  }

  private withNames(list: RetentionAssessment[]): (RetentionAssessment & { skillName: string })[] {
    return list.map((a) => this.withName(a));
  }
}
