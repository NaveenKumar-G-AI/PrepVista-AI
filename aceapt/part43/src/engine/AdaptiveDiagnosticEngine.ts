import { v4 as uuidv4 } from 'uuid';
import {
  AnalyticsEventPublisher,
  Clock,
  DiagnosticSessionRepository,
  QuestionRepository,
  RandomSource,
  SkillRepository,
  StudentRepository,
} from '../domain/ports';
import { AdaptiveDiagnosticState, AdaptiveMode, SessionStatus } from '../domain/state';
import { DiagnosticConfig, ResponseRecord } from '../domain/types';
import {
  AdaptiveResult,
  LearningHandoffPayload,
  NextQuestionResult,
  ProgressSnapshot,
  SkillSummary,
  StartDiagnosticInput,
  SubmitResponseInput,
} from '../domain/dto';
import { selectMode } from './modeSelector';
import { buildRankedCandidates } from './candidatePipeline';
import { evaluateStopping } from './stoppingCriteria';
import { initializeCoverage, recordCoverage, recordExposure, recordPatternExposure } from './signals';
import { detectFatigue } from './signals';
import { applyResponse, createInitialSkillEvidence } from './evidence';
import { explainSkill, buildNextBestActions, SkillExplanation } from './insights';

const FRIENDLY_STATUS: Record<AdaptiveMode, string> = {
  explore: 'Exploring a new area',
  investigate: 'Taking a closer look at this skill',
  verify: 'Double-checking a mixed result',
  challenge: 'Seeing how far you can go',
  transfer: 'Trying this skill in a new context',
};

const DEFAULT_CONFIG: Omit<DiagnosticConfig, 'requiredDomains'> = {
  objective: 'general_baseline',
  minQuestionsPerDomain: 3,
  maxQuestions: 24,
  minQuestions: 8,
  targetEvidenceConfidence: 'moderate',
};

export class EngineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

export class AdaptiveDiagnosticEngine {
  constructor(
    private readonly students: StudentRepository,
    private readonly questions: QuestionRepository,
    private readonly skills: SkillRepository,
    private readonly sessions: DiagnosticSessionRepository,
    private readonly analytics: AnalyticsEventPublisher,
    private readonly clock: Clock,
    private readonly rng: RandomSource
  ) {}

  async startSession(input: StartDiagnosticInput): Promise<AdaptiveDiagnosticState> {
    const config: DiagnosticConfig = { ...DEFAULT_CONFIG, ...input.config };
    const now = this.clock.now().toISOString();

    const allSkills = await this.skills.listSkills(config.requiredDomains);
    const historical = await this.students.getStudentHistoricalEvidence(input.student.studentId);
    const historyBySkill = new Map(historical.map((h) => [h.skillId, h]));

    const skillEvidence: AdaptiveDiagnosticState['skillEvidence'] = {};
    for (const skill of allSkills) {
      const h = historyBySkill.get(skill.id);
      skillEvidence[skill.id] = createInitialSkillEvidence(skill.id, h ? { label: h.capabilityLabel } : undefined);
    }

    const state: AdaptiveDiagnosticState = {
      sessionId: uuidv4(),
      student: input.student,
      config,
      status: 'in_progress',
      skillEvidence,
      coverage: initializeCoverage(config),
      exposure: {},
      patternExposure: {},
      recentResponses: [],
      fatigue: { responseTimeTrend: 'stable', accuracyTrend: 'stable', consecutiveFastGuesses: 0, severity: 'none', recommendPause: false },
      decisionLog: [],
      askedQuestionIds: [],
      questionsAsked: 0,
      startedAt: now,
      updatedAt: now,
    };

    await this.sessions.create(state);
    await this.analytics.publish({ name: 'diagnostic_started', sessionId: state.sessionId, studentId: input.student.studentId, timestamp: now });
    return state;
  }

  async getNextQuestion(sessionId: string, requestingStudentId: string): Promise<NextQuestionResult> {
    const state = await this.requireActiveSession(sessionId, requestingStudentId);
    const scopedSkills = await this.skills.listSkills(state.config.requiredDomains);

    if (state.pendingQuestionId) {
      // Protects against duplicate "next question" calls (refresh, double
      // tap) silently skipping ahead - hand back the same pending item.
      const question = await this.questions.getById(state.pendingQuestionId);
      if (question) return this.toNextQuestionResult(state, question, undefined);
    }

    const decision = selectMode(state, scopedSkills);
    const ranked = await buildRankedCandidates(this.questions, state, decision, this.rng);
    const bestScore = ranked.length > 0 ? ranked[0].score : null;
    const stopping = evaluateStopping(state, scopedSkills, bestScore);

    if (stopping.shouldStop) {
      return { done: true, progress: this.progressSnapshot(state), stoppingReason: stopping.reason, message: stopping.message };
    }

    const chosen = ranked[0];
    if (!chosen) {
      return {
        done: true,
        progress: this.progressSnapshot(state),
        stoppingReason: 'no_candidates_available',
        message: "We've run out of suitable questions for this profile, so let's wrap up here.",
      };
    }

    const now = this.clock.now().toISOString();
    const nextState: AdaptiveDiagnosticState = {
      ...state,
      pendingQuestionId: chosen.question.id,
      pendingPresentedAt: now,
      decisionLog: [
        ...state.decisionLog,
        {
          id: uuidv4(),
          questionId: chosen.question.id,
          targetSkillId: decision.targetSkillId,
          mode: decision.mode,
          reason: decision.reason,
          evidenceUsedSummary: summarizeEvidence(state, decision.targetSkillId),
          informationValue: chosen.score,
          selectedAt: now,
        },
      ],
      updatedAt: now,
    };

    await this.sessions.save(nextState);
    await this.analytics.publish({
      name: 'question_selected',
      sessionId,
      studentId: state.student.studentId,
      timestamp: now,
      properties: { mode: decision.mode, skillId: decision.targetSkillId },
    });

    return this.toNextQuestionResult(nextState, chosen.question, decision);
  }

  async submitResponse(sessionId: string, requestingStudentId: string, input: SubmitResponseInput): Promise<ProgressSnapshot> {
    const state = await this.requireActiveSession(sessionId, requestingStudentId);

    if (state.pendingQuestionId !== input.questionId) {
      throw new EngineError('STALE_OR_MISMATCHED_QUESTION', 'This question is not the currently active question for this session.');
    }

    const question = await this.questions.getById(input.questionId);
    if (!question) throw new EngineError('QUESTION_NOT_FOUND', 'Question not found.');

    const now = this.clock.now().toISOString();
    const response: ResponseRecord = {
      id: uuidv4(),
      sessionId,
      questionId: input.questionId,
      skillId: question.skillId,
      difficultyRating: question.difficultyRating,
      isCorrect: input.isCorrect,
      responseTimeMs: input.responseTimeMs,
      confidence: input.confidence,
      submittedAnswer: input.submittedAnswer,
      answeredAt: now,
    };

    const priorEvidence = state.skillEvidence[question.skillId] ?? createInitialSkillEvidence(question.skillId);
    const updatedEvidence = applyResponse(priorEvidence, response, question);
    const skill = await this.skills.getById(question.skillId);

    const nextState: AdaptiveDiagnosticState = {
      ...state,
      skillEvidence: { ...state.skillEvidence, [question.skillId]: updatedEvidence },
      coverage: skill ? recordCoverage(state.coverage, skill.domain) : state.coverage,
      exposure: recordExposure(state.exposure, question.id),
      patternExposure: recordPatternExposure(state.patternExposure, question.tags),
      recentResponses: [...state.recentResponses, response].slice(-20),
      askedQuestionIds: [...state.askedQuestionIds, question.id],
      questionsAsked: state.questionsAsked + 1,
      pendingQuestionId: undefined,
      pendingPresentedAt: undefined,
      updatedAt: now,
      fatigue: state.fatigue,
    };
    nextState.fatigue = detectFatigue(nextState);

    await this.sessions.save(nextState);
    await this.analytics.publish({
      name: 'question_answered',
      sessionId,
      studentId: state.student.studentId,
      timestamp: now,
      properties: { skillId: question.skillId, isCorrect: input.isCorrect },
    });

    return this.progressSnapshot(nextState);
  }

  async pauseSession(sessionId: string, requestingStudentId: string): Promise<void> {
    const state = await this.requireSession(sessionId, requestingStudentId);
    if (state.status !== 'in_progress') {
      throw new EngineError('INVALID_STATE_TRANSITION', `Cannot pause a session in status "${state.status}".`);
    }
    const now = this.clock.now().toISOString();
    await this.sessions.save({ ...state, status: 'paused', updatedAt: now });
    await this.analytics.publish({ name: 'diagnostic_paused', sessionId, studentId: state.student.studentId, timestamp: now });
  }

  async resumeSession(sessionId: string, requestingStudentId: string): Promise<AdaptiveDiagnosticState> {
    const state = await this.requireSession(sessionId, requestingStudentId);
    if (state.status !== 'paused') {
      throw new EngineError('INVALID_STATE_TRANSITION', `Cannot resume a session in status "${state.status}".`);
    }
    const now = this.clock.now().toISOString();
    const resumed: AdaptiveDiagnosticState = { ...state, status: 'in_progress' as SessionStatus, updatedAt: now };
    await this.sessions.save(resumed);
    await this.analytics.publish({ name: 'diagnostic_resumed', sessionId, studentId: state.student.studentId, timestamp: now });
    return resumed;
  }

  async completeSession(sessionId: string, requestingStudentId: string): Promise<AdaptiveResult> {
    const state = await this.requireSession(sessionId, requestingStudentId);
    const now = this.clock.now().toISOString();
    if (state.status !== 'completed') {
      await this.sessions.save({ ...state, status: 'completed', completedAt: now, updatedAt: now });
      await this.analytics.publish({ name: 'diagnostic_completed', sessionId, studentId: state.student.studentId, timestamp: now });
    }
    return this.getResult(sessionId, requestingStudentId);
  }

  async getResult(sessionId: string, requestingStudentId: string): Promise<AdaptiveResult> {
    const state = await this.requireSession(sessionId, requestingStudentId);
    const scopedSkills = await this.skills.listSkills(state.config.requiredDomains);
    const summaries: SkillSummary[] = scopedSkills.map((skill) => {
      const e = state.skillEvidence[skill.id];
      return {
        skillId: skill.id,
        skillLabel: skill.label,
        capabilityLabel: e?.capabilityLabel ?? 'unknown',
        confidenceLabel: e?.confidenceLabel ?? 'low',
        evidenceCount: e?.evidenceCount ?? 0,
      };
    });

    const strongestAreas = summaries
      .filter((s) => s.capabilityLabel === 'proficient' || s.capabilityLabel === 'advanced')
      .sort((a, b) => b.evidenceCount - a.evidenceCount)
      .slice(0, 5);
    const developmentAreas = summaries.filter((s) => s.capabilityLabel === 'emerging' || s.capabilityLabel === 'developing').slice(0, 5);
    const unknownAreas = summaries.filter((s) => s.capabilityLabel === 'unknown').map((s) => s.skillLabel);

    const difficultyBoundary: Record<string, number> = {};
    const speedPattern: Record<string, string> = {};
    const accuracyPattern: Record<string, number> = {};
    const confidencePattern: Record<string, string> = {};
    for (const skill of scopedSkills) {
      const e = state.skillEvidence[skill.id];
      if (!e || e.evidenceCount === 0) continue;
      difficultyBoundary[skill.id] = Math.round(e.upperBoundaryDifficulty * 100) / 100;
      speedPattern[skill.id] = e.speedStatus;
      accuracyPattern[skill.id] = Math.round((e.correctCount / e.evidenceCount) * 100);
      confidencePattern[skill.id] = e.calibrationFlag;
    }

    const nextBestActions = buildNextBestActions(state, scopedSkills);
    const learningHandoff: LearningHandoffPayload[] = nextBestActions.map((a) => ({
      skill: a.skillId,
      status: a.status,
      priority: Math.round(a.priority * 100) / 100,
      difficultyStart: state.skillEvidence[a.skillId]?.estimate ?? 0,
      evidenceConfidence: state.skillEvidence[a.skillId]?.confidenceLabel ?? 'low',
      recommendedAction: a.recommendedAction,
    }));

    return {
      sessionId,
      isFinal: state.status === 'completed',
      generatedAt: this.clock.now().toISOString(),
      currentCapability: summaries,
      strongestAreas,
      developmentAreas,
      difficultyBoundary,
      speedPattern,
      accuracyPattern,
      confidencePattern,
      evidenceConfidenceOverall: summarizeOverallConfidence(summaries),
      unknownAreas,
      nextBestActions,
      learningHandoff,
    };
  }

  async explainSkill(sessionId: string, requestingStudentId: string, skillId: string): Promise<SkillExplanation> {
    const state = await this.requireSession(sessionId, requestingStudentId);
    const skill = await this.skills.getById(skillId);
    if (!skill) throw new EngineError('SKILL_NOT_FOUND', 'Skill not found.');
    const evidence = state.skillEvidence[skillId] ?? createInitialSkillEvidence(skillId);
    return explainSkill(skill, evidence);
  }

  async getState(sessionId: string, requestingStudentId: string): Promise<AdaptiveDiagnosticState> {
    return this.requireSession(sessionId, requestingStudentId);
  }

  // ---- internal helpers ----

  private progressSnapshot(state: AdaptiveDiagnosticState): ProgressSnapshot {
    const coverage: ProgressSnapshot['coverage'] = {};
    for (const [domain, c] of Object.entries(state.coverage)) {
      coverage[domain] = { questionsAsked: c.questionsAsked, minimumRequired: c.minimumRequired, satisfied: c.satisfied };
    }
    return {
      questionsAsked: state.questionsAsked,
      minQuestions: state.config.minQuestions,
      maxQuestions: state.config.maxQuestions,
      coverage,
      fatigueSeverity: state.fatigue.severity,
    };
  }

  private toNextQuestionResult(
    state: AdaptiveDiagnosticState,
    question: NonNullable<Awaited<ReturnType<QuestionRepository['getById']>>>,
    decision: { mode: AdaptiveMode; targetSkillId: string } | undefined
  ): NextQuestionResult {
    return {
      done: false,
      question,
      progress: this.progressSnapshot(state),
      status: decision ? { mode: decision.mode, skillId: decision.targetSkillId, friendlyStatus: FRIENDLY_STATUS[decision.mode] } : undefined,
    };
  }

  private async requireSession(sessionId: string, requestingStudentId?: string): Promise<AdaptiveDiagnosticState> {
    const state = await this.sessions.get(sessionId);
    if (!state) throw new EngineError('SESSION_NOT_FOUND', 'Diagnostic session not found.');
    if (requestingStudentId && state.student.studentId !== requestingStudentId) {
      // Tenant/ownership isolation enforced at the engine layer, not just
      // the HTTP layer (spec section 67: "never allow one student to
      // retrieve another student's diagnostic").
      throw new EngineError('FORBIDDEN', 'You do not have access to this diagnostic session.');
    }
    return state;
  }

  private async requireActiveSession(sessionId: string, requestingStudentId: string): Promise<AdaptiveDiagnosticState> {
    const state = await this.requireSession(sessionId, requestingStudentId);
    if (state.status !== 'in_progress') {
      throw new EngineError('SESSION_NOT_ACTIVE', `Session is "${state.status}", not in progress.`);
    }
    return state;
  }
}

function summarizeEvidence(state: AdaptiveDiagnosticState, skillId: string): string {
  const e = state.skillEvidence[skillId];
  if (!e || e.evidenceCount === 0) return 'No prior evidence for this skill.';
  return `${e.correctCount}/${e.evidenceCount} correct so far; confidence ${e.confidenceLabel}${e.isUnstable ? '; evidence currently unstable' : ''}.`;
}

function summarizeOverallConfidence(summaries: SkillSummary[]): string {
  const withEvidence = summaries.filter((s) => s.evidenceCount > 0);
  if (withEvidence.length === 0) return 'low';
  const rank: Record<string, number> = { low: 0, moderate: 1, high: 2 };
  const avg = withEvidence.reduce((sum, s) => sum + (rank[s.confidenceLabel] ?? 0), 0) / withEvidence.length;
  return avg >= 1.5 ? 'high' : avg >= 0.75 ? 'moderate' : 'low';
}
