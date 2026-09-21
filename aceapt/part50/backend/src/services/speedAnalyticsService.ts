import { ScopeKey } from '../types/domain';
import { SpeedRepository } from '../db/repositories/types';
import { computeBaseline, resolveExpectedTime } from '../core/speedAnalysis';
import { assessBottlenecks, topBottleneck } from '../core/bottleneckEngine';
import { computeSafeSpeedZone, computeSpeedAccuracyFrontier } from '../core/speedAccuracyFrontier';
import { summarizePacing } from '../core/pacingEngine';
import { IntegrationProviders } from '../integrations/types';
import { ForbiddenError, NotFoundError } from '../errors';

export function createSpeedAnalyticsService(deps: { repo: SpeedRepository; providers: IntegrationProviders }) {
  const { repo, providers } = deps;

  return {
    /** Recomputes the profile from recent evidence every call rather than
     * trusting a possibly-stale stored snapshot, then persists the fresh
     * value so other services (and cohort views) stay in sync. */
    async getSpeedProfile(studentId: string, scope: ScopeKey) {
      const recent = await repo.listRecentAttemptsByScope(studentId, scope, 100);
      const fresh = computeBaseline(scope, recent);
      if (!fresh) return repo.getProfile(studentId, scope);

      const calibrated = recent[0] ? await providers.difficulty.getExpectedTimeMs(recent[0].question).catch(() => null) : null;
      const { expectedTimeMs, source } = resolveExpectedTime({ calibratedExpectedTimeMs: calibrated, personalBaseline: fresh });

      await repo.upsertProfile({
        studentId,
        scope,
        averageMs: fresh.averageMs,
        medianMs: fresh.medianMs,
        accuracy: fresh.accuracy,
        expectedTimeMs,
        expectedTimeSource: source,
        relativeSpeed: expectedTimeMs ? fresh.averageMs / expectedTimeMs : null,
        sampleSize: fresh.sampleSize,
        confidence: fresh.confidence,
        updatedAt: new Date(),
      });
      return repo.getProfile(studentId, scope);
    },

    async getSpeedBottlenecks(studentId: string, scope: ScopeKey) {
      const recent = await repo.listRecentAttemptsByScope(studentId, scope, 50);
      const baseline = computeBaseline(scope, recent);
      const target = await repo.getTarget(studentId, scope);
      const assessments = assessBottlenecks({ recent, baseline, guardrail: target?.guardrailAccuracy ?? 0.85, scope });

      for (const a of assessments) {
        await repo.saveBottleneck({
          studentId,
          scope: a.scope,
          type: a.type,
          evidence: a.evidence,
          confidence: a.confidence,
          metrics: a.metrics,
          status: 'ACTIVE',
        });
      }
      return { top: topBottleneck(assessments), all: assessments };
    },

    async getSpeedTargets(studentId: string, scope: ScopeKey) {
      return repo.getTarget(studentId, scope);
    },

    /** Spec 110-111: the accuracy-vs-speed frontier and the widest safe
     * zone derived from it. Fetches a wider window than the other
     * analytics calls (150 vs 50/100) because the frontier needs real
     * spread across response times, not just recent attempts. Returns an
     * empty frontier / null zone rather than a decorative guess when there
     * isn't enough evidence yet (spec 110: "do not create decorative charts"). */
    async getSpeedFrontier(studentId: string, scope: ScopeKey) {
      const recent = await repo.listRecentAttemptsByScope(studentId, scope, 150);
      const target = await repo.getTarget(studentId, scope);
      const guardrail = target?.guardrailAccuracy ?? 0.85;

      const frontier = computeSpeedAccuracyFrontier(recent);
      const safeZone = computeSafeSpeedZone(frontier, guardrail);
      return { frontier, safeZone };
    },

    async startPlacementSimulation(studentId: string, input: { totalQuestions: number; timeBudgetMs: number; speedSessionId?: string }) {
      return repo.createPacingSession({
        studentId,
        mode: 'PLACEMENT_SIMULATION',
        totalQuestions: input.totalQuestions,
        timeBudgetMs: input.timeBudgetMs,
        speedSessionId: input.speedSessionId ?? null,
      });
    },

    async startPacingSession(studentId: string, input: { totalQuestions: number; timeBudgetMs: number; speedSessionId?: string }) {
      return repo.createPacingSession({
        studentId,
        mode: 'PACING',
        totalQuestions: input.totalQuestions,
        timeBudgetMs: input.timeBudgetMs,
        speedSessionId: input.speedSessionId ?? null,
      });
    },

    async getPacingSummary(studentId: string, pacingSessionId: string) {
      const session = await repo.getPacingSession(pacingSessionId);
      if (!session) throw new NotFoundError('Pacing session not found.');
      if (session.studentId !== studentId) throw new ForbiddenError('This pacing session does not belong to this student.');

      return summarizePacing({
        totalQuestions: session.totalQuestions,
        timeBudgetMs: session.timeBudgetMs,
        elapsedMs: session.timeElapsedMs,
        questionsCompleted: session.questionsCompleted,
        correctCount: session.correctCount,
      });
    },

    /** Authorized trainer/TPO cohort view - aggregate percentages only,
     * never an individual student's data (spec 106-107, 78). */
    async getCohortBottleneckDistribution(requesterId: string, cohortId: string, studentIds: string[]) {
      const authorized = await providers.authorization.canViewCohortAnalytics(requesterId, cohortId);
      if (!authorized) throw new ForbiddenError('Not authorized to view cohort analytics.');

      const counts: Record<string, number> = {
        FAST_ACCURATE: 0,
        FAST_INACCURATE: 0,
        SLOW_ACCURATE: 0,
        SLOW_INACCURATE: 0,
      };
      for (const studentId of studentIds) {
        const attempts = await repo.listRecentAttemptsByScope(studentId, { scopeType: 'OVERALL', scopeId: 'overall' }, 20);
        for (const a of attempts) {
          if (a.performanceState in counts) counts[a.performanceState] += 1;
        }
      }
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0) || 1;
      return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Math.round((value / total) * 1000) / 10]));
    },
  };
}

export type SpeedAnalyticsService = ReturnType<typeof createSpeedAnalyticsService>;
