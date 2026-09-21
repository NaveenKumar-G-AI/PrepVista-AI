import { randomUUID } from 'node:crypto';
import type { ProofRepository } from '../repositories/proofRepository.js';
import type {
  ForecastServiceAdapter, AdaptInterventionAdapter, CapabilityServiceAdapter, NoveltyClassifierAdapter,
} from '../domain/ports.js';
import type { ExplanationAdapter } from '../adapters/groqExplanationAdapter.js';
import { DEFAULT_VERIFICATION_CONFIG, type VerificationEngineConfig } from '../domain/config.js';
import { aggregateEvidence, summarizeEvidence } from '../domain/evidenceAggregation.js';
import { evaluateVerification, type SessionSignals } from '../domain/verificationEngine.js';
import { selectVerificationPlan } from '../domain/targetedVerificationSelector.js';
import {
  analyzeTimeSegments, detectLateTestDegradation, analyzeRecoveryPattern, analyzeQuestionStrategy,
} from '../domain/simulationAnalysis.js';
import { determineFailureSignatures, buildAdaptPayload } from '../domain/failureSignature.js';
import { computeAgingState } from '../domain/readinessAging.js';
import type {
  VerificationRequirement, SessionResponse, VerificationResult, TargetedVerificationPlan,
  ProofSnapshot, TimeSegmentPerformance, RecoveryPattern, QuestionStrategySignals, FailureSignature,
} from '../domain/types.js';

const DEFAULT_REQUIREMENT_FALLBACK: Omit<VerificationRequirement, 'id' | 'targetId' | 'createdAt'> = {
  capability: 'general',
  minPerformance: 0.75,
  minNovelty: 'NOVEL',
  minConsistency: 0.7,
  minTimedPerformance: 0.7,
  minConfidenceEvidence: 4,
  weight: 1,
  isActive: true,
};

export interface CompleteVerificationOutput {
  result: VerificationResult;
  narrative: string;
  snapshot: ProofSnapshot | null;
  adaptResponse: { interventionId: string; accepted: boolean } | null;
  alreadyCompleted: boolean;
  timeSegments: TimeSegmentPerformance[];
  recovery: RecoveryPattern | null;
  questionStrategy: QuestionStrategySignals | null;
}

interface CompletionCore {
  result: VerificationResult;
  snapshot: ProofSnapshot | null;
  alreadyCompleted: boolean;
  needsSideEffects: boolean;
  timeSegments: TimeSegmentPerformance[];
  recovery: RecoveryPattern | null;
  questionStrategy: QuestionStrategySignals | null;
  failureSignatures: FailureSignature[];
  targetId: string;
}

export class ProofService {
  constructor(
    private readonly repo: ProofRepository,
    private readonly forecastAdapter: ForecastServiceAdapter,
    private readonly adaptAdapter: AdaptInterventionAdapter,
    private readonly capabilityAdapter: CapabilityServiceAdapter,
    private readonly noveltyAdapter: NoveltyClassifierAdapter,
    private readonly explanationAdapter: ExplanationAdapter,
    private readonly config: VerificationEngineConfig = DEFAULT_VERIFICATION_CONFIG,
  ) {}

  private async getOrDefaultRequirement(
    repo: ProofRepository,
    targetId: string,
    capability: string,
  ): Promise<VerificationRequirement> {
    const existing = await repo.getActiveRequirement(targetId, capability);
    if (existing) return existing;
    return {
      ...DEFAULT_REQUIREMENT_FALLBACK, id: `default_${targetId}_${capability}`, targetId, capability,
      createdAt: new Date().toISOString(),
    };
  }

  private async ingestFreshCapabilityEvidence(repo: ProofRepository, studentId: string, capability: string): Promise<void> {
    const attempts = await this.capabilityAdapter.getRecentAttempts(studentId, capability, 50);
    if (!attempts.length) return;
    const freshEvidence = await aggregateEvidence({ studentId, attempts, noveltyClassifier: this.noveltyAdapter });
    await repo.saveEvidence(freshEvidence);
  }

  async getStatus(studentId: string, targetId: string) {
    const result = await this.repo.getLatestResult(studentId, targetId);
    if (!result) {
      return { hasResult: false as const, message: 'No verification attempted yet for this target.' };
    }
    const history = await this.repo.getHistory(studentId, targetId);
    const latestSnapshot = history.length ? history[history.length - 1]! : null;
    const agingState = latestSnapshot
      ? computeAgingState(latestSnapshot.verifiedAt, new Date(), this.config.evidenceStalenessDays, this.config.agingRecheckDays)
      : 'RECHECK_RECOMMENDED';
    return { hasResult: true as const, result, agingState };
  }

  async getEvidence(studentId: string, capability?: string) {
    const evidence = await this.repo.getEvidence(studentId, capability);
    return { evidence, summary: summarizeEvidence(evidence) };
  }

  async getHistory(studentId: string, targetId: string): Promise<ProofSnapshot[]> {
    return this.repo.getHistory(studentId, targetId);
  }

  /** Section 31 — "Prove My Readiness": analyze the evidence gap, identify
   *  uncertainty, select a verification profile, and explain what will be
   *  tested, all before anything starts. Fresh practice/retention/transfer
   *  evidence from the capability model is persisted here (not just used
   *  transiently for plan selection) so it is also visible to later
   *  completeVerification/recalculate calls. */
  async startVerification(studentId: string, targetId: string): Promise<{ plan: TargetedVerificationPlan; sessionId: string | null }> {
    const forecast = await this.forecastAdapter.getForecast(studentId, targetId);
    const capability = forecast.mainUncertainty?.capability ?? DEFAULT_REQUIREMENT_FALLBACK.capability;
    const requirement = await this.getOrDefaultRequirement(this.repo, targetId, capability);

    await this.ingestFreshCapabilityEvidence(this.repo, studentId, capability);
    const evidence = await this.repo.getEvidence(studentId, capability);

    const recentSessionCount7d = await this.repo.countRecentSessions(studentId, 24 * 7);
    const minutesSinceLastSession = await this.repo.minutesSinceLastSession(studentId);

    const plan = selectVerificationPlan({
      forecast, evidence, requirement, config: this.config, recentSessionCount7d, minutesSinceLastSession,
    });

    if (plan.evidenceSufficient) {
      return { plan, sessionId: null };
    }

    const profile = await this.repo.createSimulationProfile(plan.simulationProfile);
    const session = await this.repo.createSession({
      studentId, targetId, simulationProfileId: profile.id, mode: plan.simulationProfile.mode, planReason: plan.reason,
    });
    return { plan, sessionId: session.id };
  }

  /** Section 33 — during simulation. Persists one response at a time; never
   *  reveals pass/fail while the session is in progress. */
  async recordResponse(
    studentId: string,
    sessionId: string,
    response: Omit<SessionResponse, 'studentId' | 'sessionId'>,
  ): Promise<void> {
    const session = await this.repo.getSession(sessionId, studentId);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    if (session.status === 'COMPLETED') throw new Error('SESSION_ALREADY_COMPLETED');
    await this.repo.recordResponse({ ...response, studentId, sessionId });
  }

  /** Section 34 / Section 49. Everything that must be atomic with the
   *  COMPLETED status flip — evidence capture, evaluation, and saving the
   *  result and snapshot — runs inside one database transaction wrapped
   *  around the same row lock that makes fn_complete_session idempotent
   *  (PostgresProofRepository.withTransaction). Without this, a concurrent
   *  duplicate call could unblock from the lock right after the status
   *  flip but before the winner had saved a result, see nothing yet, and
   *  reprocess — reintroducing the exact double-processing bug this method
   *  exists to prevent (caught by db.concurrency.test.ts). External calls
   *  (the AI explanation, the Adapt handoff) deliberately happen AFTER the
   *  transaction commits, so a slow or failing external call never holds a
   *  database lock. */
  async completeVerification(studentId: string, sessionId: string): Promise<CompleteVerificationOutput> {
    const core = await this.repo.withTransaction((repo) => this.runCompletionCore(repo, studentId, sessionId));

    const narrative = await this.explanationAdapter.explain(core.result);

    const verified = core.result.status === 'VERIFIED' || core.result.status === 'STRONGLY_VERIFIED';
    let adaptResponse: { interventionId: string; accepted: boolean } | null = null;
    if (core.needsSideEffects && !verified && core.failureSignatures.length) {
      adaptResponse = await this.adaptAdapter.sendFailureSignature(
        buildAdaptPayload(studentId, core.targetId, core.result.id, core.failureSignatures),
      );
    }

    return {
      result: core.result, narrative, snapshot: core.snapshot, adaptResponse, alreadyCompleted: core.alreadyCompleted,
      timeSegments: core.timeSegments, recovery: core.recovery, questionStrategy: core.questionStrategy,
    };
  }

  private async runCompletionCore(repo: ProofRepository, studentId: string, sessionId: string): Promise<CompletionCore> {
    const session = await repo.getSession(sessionId, studentId);
    if (!session) throw new Error('SESSION_NOT_FOUND');

    const { alreadyCompleted } = await repo.completeSession(sessionId, studentId);

    if (alreadyCompleted) {
      const existing = await repo.getLatestResult(studentId, session.targetId);
      if (existing && existing.sessionId === sessionId) {
        const history = await repo.getHistory(studentId, session.targetId);
        const snapshot = history.find((h) => h.resultId === existing.id) ?? history[history.length - 1] ?? null;
        return {
          result: existing, snapshot, alreadyCompleted: true, needsSideEffects: false,
          timeSegments: [], recovery: null, questionStrategy: null, failureSignatures: existing.failureSignatures,
          targetId: session.targetId,
        };
      }
      // Falls through only if the session was somehow marked COMPLETED with
      // no saved result at all (not expected: this all runs inside the
      // same transaction as the lock, so the winner's save is guaranteed
      // visible to every loser by the time it unblocks).
    }

    const responses = await repo.getResponses(sessionId, studentId);

    if (!alreadyCompleted && responses.length) {
      const simEvidence = await aggregateEvidence({
        studentId,
        attempts: responses.map((r) => ({
          attemptId: `sim_${sessionId}_${r.questionIndex}`,
          studentId,
          capability: r.capability,
          difficulty: r.difficulty,
          isCorrect: r.isCorrect,
          performance: r.isCorrect ? 1 : 0,
          timeTakenMs: r.timeTakenMs,
          expectedTimeMs: r.expectedTimeMs,
          noveltyHint: r.novelty,
          topic: r.capability,
          occurredAt: new Date().toISOString(),
          sourceEvidenceType: 'SIMULATION' as const,
        })),
      });
      await repo.saveEvidence(simEvidence.map((e) => ({ ...e, sessionId })));
    }

    const capability = responses[0]?.capability ?? DEFAULT_REQUIREMENT_FALLBACK.capability;
    const requirement = await this.getOrDefaultRequirement(repo, session.targetId, capability);
    const evidence = await repo.getEvidence(studentId, capability);

    const timeSegments = responses.length ? analyzeTimeSegments(responses) : [];
    const lateTestDegradation = timeSegments.length
      ? detectLateTestDegradation(timeSegments, this.config.lateTestDegradationThreshold)
      : false;
    const recovery = responses.length ? analyzeRecoveryPattern(responses) : null;
    const questionStrategy = responses.length ? analyzeQuestionStrategy(responses) : null;

    const sessionSignals: SessionSignals = {
      lateTestDegradation,
      recoveryConcern: recovery?.longStallFollowedByInaccuracy ?? false,
      abandoned: session.status === 'ABANDONED',
    };

    const evalResult = evaluateVerification({ evidence, requirement, config: this.config, sessionSignals });
    const failureSignatures = determineFailureSignatures({
      factors: evalResult.factors, evidence, timeSegments, recovery: recovery ?? undefined, lateTestDegradation,
    });

    const verified = evalResult.status === 'VERIFIED' || evalResult.status === 'STRONGLY_VERIFIED';
    const deterministicText = verified
      ? 'Your demonstrated performance currently meets your target readiness criteria.'
      : (failureSignatures[0]?.explanation ?? 'More evidence is needed before this can be verified.');

    const result: VerificationResult = {
      id: randomUUID(),
      studentId,
      sessionId,
      targetId: session.targetId,
      status: evalResult.status,
      confidence: evalResult.confidence,
      factors: evalResult.factors,
      evidenceSummary: evalResult.evidenceSummary,
      failureSignatures,
      explanation: deterministicText,
      createdAt: new Date().toISOString(),
    };
    const savedResult = await repo.saveResult(result);

    const snapshot = await repo.saveSnapshot({
      studentId,
      targetId: session.targetId,
      resultId: savedResult.id,
      status: evalResult.status,
      confidence: evalResult.confidence,
      verifiedAt: verified ? new Date().toISOString() : null,
      agingState: verified ? 'VERIFIED' : 'RECHECK_RECOMMENDED',
    });

    return {
      result: savedResult, snapshot, alreadyCompleted: false, needsSideEffects: true,
      timeSegments, recovery, questionStrategy, failureSignatures, targetId: session.targetId,
    };
  }

  /** Section 46 — recalculate without a new session, e.g. after new
   *  practice evidence arrives elsewhere in ACEAPT. Pulls fresh evidence
   *  from the capability model first, since that is the whole point of
   *  this endpoint. */
  async recalculate(studentId: string, targetId: string, capability: string): Promise<VerificationResult> {
    const requirement = await this.getOrDefaultRequirement(this.repo, targetId, capability);
    await this.ingestFreshCapabilityEvidence(this.repo, studentId, capability);
    const evidence = await this.repo.getEvidence(studentId, capability);
    const evalResult = evaluateVerification({ evidence, requirement, config: this.config });
    const failureSignatures = determineFailureSignatures({ factors: evalResult.factors, evidence });
    const verified = evalResult.status === 'VERIFIED' || evalResult.status === 'STRONGLY_VERIFIED';
    const result: VerificationResult = {
      id: randomUUID(),
      studentId,
      sessionId: null,
      targetId,
      status: evalResult.status,
      confidence: evalResult.confidence,
      factors: evalResult.factors,
      evidenceSummary: evalResult.evidenceSummary,
      failureSignatures,
      explanation: verified
        ? 'Your demonstrated performance currently meets your target readiness criteria.'
        : (failureSignatures[0]?.explanation ?? 'More evidence is needed before this can be verified.'),
      createdAt: new Date().toISOString(),
    };
    return this.repo.saveResult(result);
  }
}
