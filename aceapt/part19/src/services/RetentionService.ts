// ============================================================================
// RetentionService — the facade the API layer (and the demo) talks to.
//
// This is the only place that wires the engine, repositories, cross-feature
// ports, AI content, and the event bus together. Everything it depends on
// is an interface (see the imports below), so every piece is swappable
// without touching this orchestration logic.
// ============================================================================

import { randomUUID } from 'node:crypto';
import {
  KnowledgeState,
  RetrievalAttempt,
  RecallSession,
  ReactivationSession,
  ReviewPlan,
  ContextExposure,
  RetrievalMode,
  RetentionEvidence,
  DashboardBandCounts,
  KnowledgeStage,
} from '../domain/types';
import {
  KnowledgeStateRepository,
  RetrievalAttemptRepository,
  RecallSessionRepository,
  ReactivationSessionRepository,
  ConceptDependencyRepository,
} from '../repositories/ports';
import { MasteryPort, QuestionPort, ReadinessPort, InterventionPort, ReasoningPort, QuestionRef } from '../integration/featurePorts';
import { AIContentProvider, ConceptContext } from '../ai/AIContentProvider';
import { EventBus } from '../events/EventBus';
import { buildRetentionEvidence } from '../engine/evidence';
import { calculateRetentionStrength } from '../engine/retentionStrength';
import { assessDecay, DEFAULT_DECAY_PROFILE, PersonalDecayProfile } from '../engine/decayDetection';
import { buildReviewPlan } from '../engine/recallScheduler';
import { propagatePrerequisiteRisk, PropagationResult } from '../engine/conceptGraph';
import { startReactivationSession, recordReactivationOutcome, ReactivationAction } from '../engine/reactivationEngine';
import { fetchBlindRetrievalQuestions, fetchContrastiveRecallSet, fetchMixedRetentionSet } from '../engine/sessionBuilders';
import { analyzeRetrievalUnderPressure } from '../engine/pressureAnalysis';

type Clock = () => string;

export interface RetentionServiceDeps {
  knowledgeStateRepo: KnowledgeStateRepository;
  attemptRepo: RetrievalAttemptRepository;
  recallSessionRepo: RecallSessionRepository;
  reactivationSessionRepo: ReactivationSessionRepository;
  conceptDependencyRepo: ConceptDependencyRepository;
  masteryPort: MasteryPort;
  questionPort: QuestionPort;
  readinessPort: ReadinessPort;
  interventionPort: InterventionPort;
  reasoningPort: ReasoningPort;
  aiProvider: AIContentProvider;
  eventBus: EventBus;
  /** Injectable clock so tests/demos can simulate elapsed time. Defaults to the real clock. */
  clock?: Clock;
  idGenerator?: () => string;
}

export interface SubmitAttemptInput {
  conceptId: string;
  mode: RetrievalMode;
  correct: boolean;
  latencyMs: number;
  hintsUsed: number;
  explanationRequested: boolean;
  confidenceSelfReport?: 1 | 2 | 3 | 4 | 5;
  identifiedConceptCorrectly?: boolean;
  context: ContextExposure;
}

export interface SubmitAttemptResult {
  attempt: RetrievalAttempt;
  knowledgeState: KnowledgeState;
  evidence: RetentionEvidence;
  decayRationale: string[];
  weakeningDetected: boolean;
  reactivationRecommended: boolean;
  propagatedConcepts: PropagationResult[];
}

type AttemptTelemetry = Omit<SubmitAttemptInput, 'conceptId' | 'mode' | 'correct'>;

export interface ObservabilitySummary {
  totalAttempts: number;
  recallSuccessRate: number | null;
  reactivationSuccessRate: number | null;
  transferAfterDelaySuccessRate: number | null;
  weakeningDetectedCount: number;
  knowledgeStabilizedCount: number;
  dashboard: DashboardBandCounts;
}

const REACTIVATION_MODE: Record<'repair' | 'similar' | 'transfer', RetrievalMode> = {
  repair: 'micro',
  similar: 'standard',
  transfer: 'transfer',
};

export class RetentionService {
  private clock: Clock;
  private idGenerator: () => string;
  private decayProfiles = new Map<string, PersonalDecayProfile>();
  /** Concepts soft-flagged by prerequisite propagation, folded into the next Today's Memory Check. */
  private monitorFlags = new Map<string, Set<string>>();

  constructor(private deps: RetentionServiceDeps) {
    this.clock = deps.clock ?? (() => new Date().toISOString());
    this.idGenerator = deps.idGenerator ?? randomUUID;
  }

  // ---------------------------------------------------------------------
  // Entry point from Feature 14: a concept just became MASTERED.
  // ---------------------------------------------------------------------
  async onConceptMastered(studentId: string, conceptId: string): Promise<KnowledgeState> {
    const mastery = await this.deps.masteryPort.getMasteryRecord(studentId, conceptId);
    if (!mastery) {
      throw new Error(
        `No mastery record for student ${studentId} / concept ${conceptId}. ` +
          `Feature 19 does not decide mastery — Feature 14 must record it first.`
      );
    }
    const now = this.clock();
    const state: KnowledgeState = {
      studentId,
      conceptId,
      stage: 'MASTERED',
      riskState: 'STABLE',
      strengthBand: 'INSUFFICIENT_EVIDENCE',
      evidenceSufficiency: 0,
      lastSuccessAt: mastery.masteredAt,
      masteredAt: mastery.masteredAt,
      lastEvaluatedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.knowledgeStateRepo.upsert(state);
    return state;
  }

  async listKnowledgeStates(studentId: string): Promise<KnowledgeState[]> {
    return this.deps.knowledgeStateRepo.listByStudent(studentId);
  }

  async getTodaysMemoryCheck(studentId: string): Promise<ReviewPlan> {
    const states = await this.deps.knowledgeStateRepo.listByStudent(studentId);
    const plan = buildReviewPlan(studentId, states, this.clock());

    const flagged = this.monitorFlags.get(studentId);
    if (flagged?.size) {
      const present = new Set(plan.items.map(i => i.conceptId));
      for (const conceptId of flagged) {
        if (!present.has(conceptId) && plan.items.length < 3) {
          plan.items.push({ conceptId, priorityScore: 0.2, reason: 'MONITOR' });
        }
      }
      plan.estimatedMinutes = plan.items.length ? Math.max(1, Math.round(plan.items.length * 1.5)) : 0;
    }
    return plan;
  }

  // ---------------------------------------------------------------------
  // Recall sessions
  // ---------------------------------------------------------------------
  async startRecallSession(
    studentId: string,
    conceptIds: string[],
    type: RecallSession['type']
  ): Promise<{ session: RecallSession; questions: QuestionRef[] }> {
    const now = this.clock();
    const session: RecallSession = {
      id: this.idGenerator(),
      studentId,
      type,
      conceptIds,
      startedAt: now,
      completedAt: null,
      attemptIds: [],
    };
    await this.deps.recallSessionRepo.create(session);
    this.deps.eventBus.emit({
      type: 'RETENTION_CHECK_STARTED',
      studentId,
      timestamp: now,
      payload: { sessionId: session.id, sessionType: type, conceptIds },
    });

    let questions: QuestionRef[];
    if (type === 'blind_retrieval') questions = await fetchBlindRetrievalQuestions(conceptIds, this.deps.questionPort);
    else if (type === 'contrastive_recall') questions = await fetchContrastiveRecallSet(conceptIds, this.deps.questionPort);
    else if (type === 'mixed_retention') questions = await fetchMixedRetentionSet(conceptIds, this.deps.questionPort);
    else {
      const batches = await Promise.all(
        conceptIds.map(c => this.deps.questionPort.getQuestions({ conceptId: c, mode: 'micro', count: 1 }))
      );
      questions = batches.flat();
    }

    return { session, questions };
  }

  async submitRetrievalAttempt(sessionId: string, input: SubmitAttemptInput): Promise<SubmitAttemptResult> {
    const session = await this.deps.recallSessionRepo.get(sessionId);
    if (!session) throw new Error(`Unknown recall session: ${sessionId}`);

    const attempt = await this.recordAttempt(session.studentId, sessionId, input);

    session.attemptIds.push(attempt.id);
    if (session.attemptIds.length >= session.conceptIds.length) session.completedAt = this.clock();
    await this.deps.recallSessionRepo.update(session);

    this.deps.eventBus.emit({
      type: 'RECALL_COMPLETED',
      studentId: session.studentId,
      conceptId: attempt.conceptId,
      timestamp: this.clock(),
      payload: { sessionId, correct: attempt.correct },
    });

    return this.recomputeAfterAttempt(session.studentId, attempt);
  }

  // ---------------------------------------------------------------------
  // Reactivation
  // ---------------------------------------------------------------------
  async startReactivation(studentId: string, conceptId: string): Promise<{ session: ReactivationSession; contentText: string }> {
    const now = this.clock();
    const session = startReactivationSession(this.idGenerator(), studentId, conceptId, now);
    await this.deps.reactivationSessionRepo.create(session);
    this.deps.eventBus.emit({ type: 'REACTIVATION_STARTED', studentId, conceptId, timestamp: now });

    const ctx: ConceptContext = { conceptId, conceptLabel: conceptId };
    const contentText = await this.deps.aiProvider.generateRecallPrompt(ctx);
    return { session, contentText };
  }

  async submitReactivationStep(
    reactivationSessionId: string,
    phase: 'repair' | 'similar' | 'transfer',
    correct: boolean,
    telemetry: AttemptTelemetry
  ): Promise<{ session: ReactivationSession; action: ReactivationAction; contentText?: string }> {
    const session = await this.deps.reactivationSessionRepo.get(reactivationSessionId);
    if (!session) throw new Error(`Unknown reactivation session: ${reactivationSessionId}`);

    const attempt = await this.recordAttempt(session.studentId, reactivationSessionId, {
      conceptId: session.conceptId,
      mode: REACTIVATION_MODE[phase],
      correct,
      ...telemetry,
    });

    const decision = recordReactivationOutcome(session, phase, correct, attempt.id, this.clock());
    await this.deps.reactivationSessionRepo.update(decision.session);
    await this.recomputeAfterAttempt(session.studentId, attempt);

    let contentText: string | undefined;
    const ctx: ConceptContext = { conceptId: session.conceptId, conceptLabel: session.conceptId };
    if (decision.nextAction.kind === 'repair_step') {
      contentText = await this.generateRepairContent(ctx, decision.nextAction.level);
    }

    if (decision.nextAction.kind === 'done') {
      const now = this.clock();
      if (decision.nextAction.outcome === 'retained_again') {
        // A completed repair → similar → transfer chain is authoritative
        // evidence of recovery, not just one more point to average against
        // the concept's history — so it stabilizes risk directly instead
        // of waiting for the rolling window to catch up. Matches the
        // brief's own loop: REACTIVATE → VERIFY → STABILIZE.
        await this.stabilizeConcept(session.studentId, session.conceptId, now);
      }
      this.deps.eventBus.emit({
        type: 'REACTIVATION_COMPLETED',
        studentId: session.studentId,
        conceptId: session.conceptId,
        timestamp: now,
        payload: { outcome: decision.nextAction.outcome },
      });
      if (decision.nextAction.outcome === 'escalated') {
        await this.deps.interventionPort.escalate(session.studentId, session.conceptId, 'reactivation_exhausted_all_levels');
      }
    }

    return { session: decision.session, action: decision.nextAction, contentText };
  }

  private async generateRepairContent(ctx: ConceptContext, level: 1 | 2 | 3 | 4 | 5): Promise<string> {
    if (level === 1) return this.deps.aiProvider.generateRecallPrompt(ctx);
    if (level === 2) return this.deps.aiProvider.generateHint(ctx, level);
    if (level === 3) return this.deps.aiProvider.generateConceptReminder(ctx);
    if (level === 4) return this.deps.aiProvider.generateHint(ctx, level); // guided solve leans on a stronger hint here
    return this.deps.aiProvider.generateMicroLesson(ctx);
  }

  // ---------------------------------------------------------------------
  // Dashboard & observability
  // ---------------------------------------------------------------------
  async getKnowledgeHealthDashboard(studentId: string): Promise<DashboardBandCounts> {
    return this.summarizeDashboard(await this.deps.knowledgeStateRepo.listByStudent(studentId));
  }

  private summarizeDashboard(states: KnowledgeState[]): DashboardBandCounts {
    const counts: DashboardBandCounts = { strong: 0, stable: 0, weakening: 0, needsRecall: 0, total: states.length };
    for (const s of states) {
      if (s.riskState === 'AT_RISK' || s.riskState === 'REACTIVATION_REQUIRED' || s.riskState === 'INACCESSIBLE') {
        counts.needsRecall++;
      } else if (s.riskState === 'WEAKENING' || s.riskState === 'MONITOR') {
        counts.weakening++;
      } else if (s.strengthBand === 'STRONG') {
        counts.strong++;
      } else {
        counts.stable++;
      }
    }
    return counts;
  }

  async getObservability(studentId?: string): Promise<ObservabilitySummary> {
    const log = this.deps.eventBus.getLog(studentId ? { studentId } : undefined);
    const states = studentId
      ? await this.deps.knowledgeStateRepo.listByStudent(studentId)
      : await this.deps.knowledgeStateRepo.listAll();

    const recallCompleted = log.filter(e => e.type === 'RECALL_COMPLETED');
    const recallCorrect = recallCompleted.filter(e => e.payload?.correct === true);
    const reactivationCompleted = log.filter(e => e.type === 'REACTIVATION_COMPLETED');
    const reactivationRetained = reactivationCompleted.filter(e => e.payload?.outcome === 'retained_again');

    return {
      totalAttempts: recallCompleted.length,
      recallSuccessRate: recallCompleted.length ? recallCorrect.length / recallCompleted.length : null,
      reactivationSuccessRate: reactivationCompleted.length ? reactivationRetained.length / reactivationCompleted.length : null,
      // Left as an explicit null rather than invented: needs a product definition
      // of "after delay" (how long?) before it can be computed meaningfully.
      transferAfterDelaySuccessRate: null,
      weakeningDetectedCount: log.filter(e => e.type === 'WEAKENING_DETECTED').length,
      knowledgeStabilizedCount: log.filter(e => e.type === 'KNOWLEDGE_STABILIZED').length,
      dashboard: this.summarizeDashboard(states),
    };
  }

  private async stabilizeConcept(studentId: string, conceptId: string, now: string): Promise<void> {
    const state = await this.deps.knowledgeStateRepo.get(studentId, conceptId);
    if (!state || state.riskState === 'STABLE') return;
    await this.deps.knowledgeStateRepo.upsert({ ...state, riskState: 'STABLE', lastEvaluatedAt: now, updatedAt: now });
    this.deps.eventBus.emit({ type: 'KNOWLEDGE_STABILIZED', studentId, conceptId, timestamp: now });
  }

  // ---------------------------------------------------------------------
  // Shared internals
  // ---------------------------------------------------------------------
  private validateAttemptInput(input: SubmitAttemptInput) {
    if (!input.conceptId) throw new Error('conceptId is required');
    if (typeof input.correct !== 'boolean') throw new Error('correct must be a boolean');
    if (typeof input.latencyMs !== 'number') throw new Error('latencyMs must be a number');
    if (!input.context) throw new Error('context is required');
  }

  private async recordAttempt(studentId: string, sessionId: string, input: SubmitAttemptInput): Promise<RetrievalAttempt> {
    this.validateAttemptInput(input);
    const attempt: RetrievalAttempt = {
      id: this.idGenerator(),
      studentId,
      conceptId: input.conceptId,
      sessionId,
      mode: input.mode,
      correct: input.correct,
      latencyMs: input.latencyMs,
      hintsUsed: input.hintsUsed,
      explanationRequested: input.explanationRequested,
      confidenceSelfReport: input.confidenceSelfReport,
      identifiedConceptCorrectly: input.identifiedConceptCorrectly,
      context: input.context,
      createdAt: this.clock(),
    };
    await this.deps.attemptRepo.add(attempt);
    this.deps.eventBus.emit({
      type: 'RECALL_ATTEMPTED',
      studentId,
      conceptId: attempt.conceptId,
      timestamp: attempt.createdAt,
      payload: { mode: attempt.mode, sessionId },
    });
    return attempt;
  }

  private async recomputeAfterAttempt(studentId: string, attempt: RetrievalAttempt): Promise<SubmitAttemptResult> {
    const now = this.clock();
    const current = await this.deps.knowledgeStateRepo.get(studentId, attempt.conceptId);
    if (!current) {
      throw new Error(`No knowledge state for ${studentId}/${attempt.conceptId} — was onConceptMastered() ever called?`);
    }

    const attempts = await this.deps.attemptRepo.listByConcept(studentId, attempt.conceptId);
    const mastery = await this.deps.masteryPort.getMasteryRecord(studentId, attempt.conceptId);
    const evidence = buildRetentionEvidence(studentId, attempt.conceptId, attempts, mastery?.masterySuccessRate ?? null, now);
    const strength = calculateRetentionStrength(evidence, attempts);

    const profile = this.decayProfiles.get(studentId) ?? DEFAULT_DECAY_PROFILE(studentId);
    const decay = assessDecay(evidence, current.riskState, profile, attempt.correct);
    this.decayProfiles.set(studentId, { ...profile, sampleSize: profile.sampleSize + 1 });

    let stage: KnowledgeStage = current.stage;
    if (attempt.correct) {
      const daysSinceMastery = current.masteredAt
        ? (new Date(attempt.createdAt).getTime() - new Date(current.masteredAt).getTime()) / 86_400_000
        : null;
      // Stage is a high-water mark of demonstrated capability, tracked
      // separately from riskState (current confidence/urgency) — a concept
      // can be TRANSFERABLE and later WEAKENING at the same time.
      if (stage === 'MASTERED' && daysSinceMastery !== null && daysSinceMastery >= 3) {
        stage = 'RETAINED';
      }
      if (stage === 'RETAINED' && attempt.mode === 'transfer') {
        stage = 'TRANSFERABLE';
      }
      // EXAM_READY is Feature 13's call (readiness, not retention) — Feature 19 never sets it.
    }

    const updated: KnowledgeState = {
      ...current,
      stage,
      riskState: decay.nextRiskState,
      strengthBand: strength.band,
      strengthScore: strength.score,
      evidenceSufficiency: strength.sufficiency,
      lastSuccessAt: attempt.correct ? attempt.createdAt : current.lastSuccessAt,
      lastEvaluatedAt: now,
      updatedAt: now,
    };
    await this.deps.knowledgeStateRepo.upsert(updated);

    this.deps.eventBus.emit({
      type: 'RETENTION_UPDATED',
      studentId,
      conceptId: attempt.conceptId,
      timestamp: now,
      payload: { riskState: updated.riskState, strengthBand: updated.strengthBand },
    });

    const justWeakened = decay.weakening && current.riskState !== updated.riskState;
    if (justWeakened) {
      this.deps.eventBus.emit({
        type: 'WEAKENING_DETECTED',
        studentId,
        conceptId: attempt.conceptId,
        timestamp: now,
        payload: { rationale: decay.rationale },
      });
    }
    if (attempt.mode === 'transfer' && attempt.correct) {
      this.deps.eventBus.emit({ type: 'TRANSFER_VERIFIED', studentId, conceptId: attempt.conceptId, timestamp: now });
    }
    if (updated.riskState === 'STABLE' && current.riskState !== 'STABLE') {
      this.deps.eventBus.emit({ type: 'KNOWLEDGE_STABILIZED', studentId, conceptId: attempt.conceptId, timestamp: now });
    }

    const propagatedConcepts = await propagatePrerequisiteRisk(attempt.conceptId, updated.riskState, this.deps.conceptDependencyRepo);
    if (propagatedConcepts.length) {
      const set = this.monitorFlags.get(studentId) ?? new Set<string>();
      propagatedConcepts.forEach(p => set.add(p.conceptId));
      this.monitorFlags.set(studentId, set);
    }

    await analyzeRetrievalUnderPressure(studentId, attempt.conceptId, evidence, this.deps.readinessPort);

    return {
      attempt,
      knowledgeState: updated,
      evidence,
      decayRationale: decay.rationale,
      weakeningDetected: justWeakened,
      reactivationRecommended: updated.riskState === 'REACTIVATION_REQUIRED',
      propagatedConcepts,
    };
  }
}
