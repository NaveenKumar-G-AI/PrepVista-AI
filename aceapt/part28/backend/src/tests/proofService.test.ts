import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryProofRepository } from '../repositories/inMemoryProofRepository.js';
import { ProofService } from '../services/proofService.js';
import { SimulatedExplanationAdapter } from '../adapters/simulatedExplanationAdapter.js';
import {
  DemoForecastAdapter, DemoAdaptAdapter, DemoCapabilityAdapter, HeuristicNoveltyAdapter,
} from '../adapters/demoAdapters.js';
import type { ForecastSignal } from '../domain/ports.js';

describe('ProofService — end-to-end orchestration (in-memory repository)', () => {
  let repo: InMemoryProofRepository;
  let forecastAdapter: DemoForecastAdapter;
  let adaptAdapter: DemoAdaptAdapter;
  let capabilityAdapter: DemoCapabilityAdapter;
  let service: ProofService;
  let studentId: string;
  let targetId: string;

  beforeEach(() => {
    repo = new InMemoryProofRepository();
    forecastAdapter = new DemoForecastAdapter(new Map());
    adaptAdapter = new DemoAdaptAdapter();
    capabilityAdapter = new DemoCapabilityAdapter(new Map());
    service = new ProofService(
      repo, forecastAdapter, adaptAdapter, capabilityAdapter, new HeuristicNoveltyAdapter(),
      new SimulatedExplanationAdapter(),
    );
    studentId = randomUUID();
    targetId = randomUUID();
    repo.requirements.push({
      id: 'req1', targetId, capability: 'arrays', minPerformance: 0.8, minNovelty: 'NOVEL',
      minConsistency: 0.7, minTimedPerformance: 0.7, minConfidenceEvidence: 4, weight: 1, isActive: true,
      createdAt: new Date().toISOString(),
    });
    const forecast: ForecastSignal = {
      studentId, targetId, readinessForecastPct: 0.79, targetPct: 0.82,
      mainUncertainty: { capability: 'arrays', condition: 'TIME_PRESSURE' },
    };
    forecastAdapter.setFixture(studentId, targetId, forecast);
  });

  it('returns no result before any verification has been attempted', async () => {
    const status = await service.getStatus(studentId, targetId);
    expect(status.hasResult).toBe(false);
  });

  it('walks start -> respond -> complete and produces a full result with a narrative', async () => {
    const { plan, sessionId } = await service.startVerification(studentId, targetId);
    expect(sessionId).not.toBeNull();
    expect(plan.condition).toBe('TIME_PRESSURE');

    const n = plan.simulationProfile.questionCount;
    for (let i = 0; i < n; i++) {
      await service.recordResponse(studentId, sessionId!, {
        questionIndex: i, capability: 'arrays', difficulty: 'HARD', novelty: 'NOVEL',
        isCorrect: i < n * 0.5, timeTakenMs: 60_000, expectedTimeMs: 60_000,
        skipped: false, changedAnswer: false, stalled: false,
      });
    }

    const outcome = await service.completeVerification(studentId, sessionId!);
    expect(outcome.narrative.length).toBeGreaterThan(0);
    expect(outcome.result.status).not.toBe('NOT_VERIFIED');
    expect(outcome.alreadyCompleted).toBe(false);
    expect(outcome.snapshot).not.toBeNull();

    const status = await service.getStatus(studentId, targetId);
    expect(status.hasResult).toBe(true);
  });

  it('is idempotent: completing an already-completed session returns the existing result without reprocessing', async () => {
    const { sessionId } = await service.startVerification(studentId, targetId);
    await service.recordResponse(studentId, sessionId!, {
      questionIndex: 0, capability: 'arrays', difficulty: 'HARD', novelty: 'NOVEL', isCorrect: true,
      timeTakenMs: 60_000, expectedTimeMs: 60_000, skipped: false, changedAnswer: false, stalled: false,
    });
    const first = await service.completeVerification(studentId, sessionId!);
    const second = await service.completeVerification(studentId, sessionId!);

    expect(first.alreadyCompleted).toBe(false);
    expect(second.alreadyCompleted).toBe(true);
    expect(second.result.id).toBe(first.result.id);
    expect(repo.results).toHaveLength(1);
    expect(repo.snapshots).toHaveLength(1);
    expect(adaptAdapter.received.length).toBeLessThanOrEqual(1); // never fired twice for one completion
  });

  it('forwards a failure signature to Adapt exactly once when verification does not pass', async () => {
    const { sessionId } = await service.startVerification(studentId, targetId);
    await service.recordResponse(studentId, sessionId!, {
      questionIndex: 0, capability: 'arrays', difficulty: 'HARD', novelty: 'FAMILIAR', isCorrect: false,
      timeTakenMs: 200_000, expectedTimeMs: 60_000, skipped: false, changedAnswer: false, stalled: true,
    });
    const outcome = await service.completeVerification(studentId, sessionId!);
    expect(['NOT_VERIFIED', 'EMERGING_EVIDENCE', 'CONDITIONALLY_VERIFIED']).toContain(outcome.result.status);
    expect(adaptAdapter.received).toHaveLength(1);
    expect(adaptAdapter.received[0]!.studentId).toBe(studentId);
  });

  it('skips creating a new session when existing evidence is already sufficient', async () => {
    capabilityAdapter.setAttempts(
      studentId,
      Array.from({ length: 15 }).map((_, i) => ({
        attemptId: `a_${i}`, studentId, capability: 'arrays', difficulty: 'HARD' as const, isCorrect: true,
        performance: 1, timeTakenMs: 55_000, expectedTimeMs: 60_000, noveltyHint: 'HIGHLY_NOVEL' as const,
        topic: 'arrays', occurredAt: new Date(Date.now() - i * 3_600_000).toISOString(),
        sourceEvidenceType: 'PRACTICE' as const,
      })),
    );
    const { plan, sessionId } = await service.startVerification(studentId, targetId);
    expect(plan.evidenceSufficient).toBe(true);
    expect(sessionId).toBeNull();
    expect(repo.sessions).toHaveLength(0);
  });
});
