import {
  BottleneckType,
  NewSpeedAttempt,
  PressureLevel,
  ScopeKey,
  SessionState,
  SpeedAttemptRecord,
  SpeedSession,
  TrainingMode,
} from '../types/domain';
import { SpeedRepository } from '../db/repositories/types';
import { classifySpeedState, computeBaseline, resolveExpectedTime } from '../core/speedAnalysis';
import { evaluateTrainingPolicy, TrainingPolicyContext } from '../core/trainingPolicy';
import { perAttemptFeedback, sessionSummary } from '../core/feedbackMessages';
import { IntegrationProviders } from '../integrations/types';
import { AiCoachingService } from './aiCoachingService';
import { ForbiddenError, NotFoundError } from '../errors';

const DEFAULT_GUARDRAIL = 0.85;

export interface StartSessionInput {
  mode: TrainingMode;
  scope: ScopeKey;
  requestedPressure?: PressureLevel;
  guardrailAccuracy?: number;
  goalId?: string;
}

export function createSpeedSessionService(deps: {
  repo: SpeedRepository;
  providers: IntegrationProviders;
  aiCoaching: AiCoachingService;
}) {
  const { repo, providers, aiCoaching } = deps;

  async function assertOwnership(studentId: string, session: SpeedSession | null): Promise<SpeedSession> {
    if (!session) throw new NotFoundError('Speed session not found.');
    if (session.studentId !== studentId) throw new ForbiddenError('This speed session does not belong to this student.');
    return session;
  }

  return {
    /** Spec section 38, 43, 52, 97: mastery-aware start - never opens an
     * aggressive speed mode on a skill the student hasn't yet grasped. */
    async startSpeedSession(studentId: string, input: StartSessionInput): Promise<SpeedSession> {
      const history = await repo.listRecentAttemptsByScope(studentId, input.scope, 50);
      const baseline = computeBaseline(input.scope, history);
      const mastery = await providers.mastery.getMasteryLevel(studentId, input.scope.scopeId).catch(() => null);

      const lowMastery = mastery === 'NOT_STARTED' || mastery === 'DEVELOPING';
      const pressure = lowMastery ? PressureLevel.SOFT_TIMER : input.requestedPressure ?? PressureLevel.TARGET_TIME;
      const mode =
        lowMastery && (input.mode === TrainingMode.STRATEGY || input.mode === TrainingMode.CALCULATION)
          ? TrainingMode.BALANCED
          : input.mode;

      return repo.createSession({
        studentId,
        mode,
        pressureLevel: pressure,
        state: SessionState.ACTIVE,
        scope: input.scope,
        targetTimeMs: baseline ? baseline.averageMs : null,
        guardrailAccuracy: input.guardrailAccuracy ?? DEFAULT_GUARDRAIL,
        goalId: input.goalId ?? null,
      });
    },

    async getSpeedSession(studentId: string, sessionId: string): Promise<SpeedSession> {
      return assertOwnership(studentId, await repo.getSession(sessionId));
    },

    async submitSpeedAttempt(studentId: string, sessionId: string, input: Omit<NewSpeedAttempt, 'sessionId' | 'studentId'>) {
      const session = await assertOwnership(studentId, await repo.getSession(sessionId));
      if (session.state === SessionState.COMPLETED || session.state === SessionState.ABANDONED) {
        throw new Error('This session has already ended.');
      }

      const history = await repo.listRecentAttemptsByScope(studentId, session.scope, 50);
      const baseline = computeBaseline(session.scope, history);

      const calibrated = await providers.difficulty.getExpectedTimeMs(input.question).catch(() => null);
      const { expectedTimeMs, source } = resolveExpectedTime({ calibratedExpectedTimeMs: calibrated, personalBaseline: baseline });
      const { relativeSpeed, state } = classifySpeedState(input.responseTimeMs, expectedTimeMs, input.correct);

      const attempt: SpeedAttemptRecord = await repo.addAttempt({
        ...input,
        sessionId,
        studentId,
        expectedTimeMs,
        expectedTimeSource: source,
        relativeSpeed,
        performanceState: state,
      });

      const updatedHistory = [...history, attempt];
      const sessionAttempts = updatedHistory.filter((a) => a.sessionId === sessionId);

      const policyCtx: TrainingPolicyContext = {
        recentAttempts: updatedHistory,
        sessionAttempts,
        baseline,
        guardrailAccuracy: session.guardrailAccuracy,
        currentTargetMs: session.targetTimeMs,
        currentMode: session.mode,
      };
      const decision = evaluateTrainingPolicy(policyCtx);

      let updatedSession = session;
      if (decision.pressureAction !== 'HOLD' || decision.nextMode !== session.mode) {
        updatedSession = await repo.updateSession(sessionId, {
          targetTimeMs: decision.nextTargetMs ?? session.targetTimeMs,
          mode: decision.nextMode,
          state:
            decision.signal === BottleneckType.RUSHING || decision.signal === BottleneckType.KNOWLEDGE_GAP
              ? SessionState.PRESSURE_ADJUSTMENT
              : session.state,
        });
      }

      const sessionAccuracySoFar = sessionAttempts.filter((a) => a.correct).length / sessionAttempts.length;
      const feedback = perAttemptFeedback(attempt, session.guardrailAccuracy, sessionAccuracySoFar);

      const coachingNote = decision.requiresCoachingNarrative ? await aiCoaching.enrich(decision) : null;

      return { attempt, feedback, policy: decision, coachingNote, session: updatedSession };
    },

    async completeSpeedSession(studentId: string, sessionId: string) {
      const session = await assertOwnership(studentId, await repo.getSession(sessionId));
      const attempts = await repo.listAttemptsBySession(sessionId);
      const half = Math.max(1, Math.floor(attempts.length / 2));
      const before = attempts.slice(0, half);
      const after = attempts.length > half ? attempts.slice(half) : before;

      const stats = (list: SpeedAttemptRecord[]) =>
        list.length
          ? {
              avgMs: Math.round(list.reduce((sum, a) => sum + a.responseTimeMs, 0) / list.length),
              accuracy: list.filter((a) => a.correct).length / list.length,
            }
          : { avgMs: 0, accuracy: 0 };

      const beforeStats = stats(before);
      const afterStats = stats(after);

      const updated = await repo.updateSession(sessionId, { state: SessionState.COMPLETED, completedAt: new Date() });

      await providers.readiness
        .reportSpeedSignal({
          studentId,
          scopeSkillId: session.scope.scopeId,
          timeEfficiency: afterStats.avgMs > 0 ? Math.min(1, beforeStats.avgMs / Math.max(afterStats.avgMs, 1)) : 0.5,
          speedUnderPressure: afterStats.avgMs > 0 ? 1 : 0.5,
          accuracyUnderPressure: afterStats.accuracy,
          pacingQuality: 0.5,
          decisionQuality: 0.5,
        })
        .catch(() => undefined);

      const summary = sessionSummary(
        beforeStats,
        afterStats,
        'Strategy selection',
        afterStats.accuracy < beforeStats.accuracy - 0.05 ? 'Accuracy dipped at higher speed - worth another balanced session.' : null,
        'Continue reducing decision time gradually.',
      );

      return { session: updated, summary, attemptCount: attempts.length };
    },
  };
}

export type SpeedSessionService = ReturnType<typeof createSpeedSessionService>;
