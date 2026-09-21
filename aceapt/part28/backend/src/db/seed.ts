// Walks the exact Section 55 "Startupthon Demo Scenario" end-to-end against
// real Postgres, and leaves the resulting rows in the database as demo data.
// Isolated to one clearly-marked demo student (Section 54) so it never
// collides with real student data. This is also a genuine integration
// smoke test: if this script fails, the real flow is broken.

import { randomUUID } from 'node:crypto';
import { createAdminPool } from './pool.js';
import { PostgresProofRepository } from '../repositories/postgresProofRepository.js';
import { ProofService } from '../services/proofService.js';
import { SimulatedExplanationAdapter } from '../adapters/simulatedExplanationAdapter.js';
import {
  DemoForecastAdapter, DemoAdaptAdapter, DemoCapabilityAdapter, HeuristicNoveltyAdapter,
} from '../adapters/demoAdapters.js';
import type { RawAttemptRecord, ForecastSignal } from '../domain/ports.js';

async function main() {
  const pool = createAdminPool();
  const studentId = randomUUID();
  const targetId = randomUUID();

  await pool.query('insert into students (id, full_name) values ($1, $2)', [studentId, 'Demo Student (ACEAPT PROOF seed)']);
  await pool.query(
    'insert into verification_targets (id, student_id, role_name, target_profile) values ($1,$2,$3,$4)',
    [targetId, studentId, 'Software Engineer — Product Company', JSON.stringify({ source: 'seed' })],
  );
  await pool.query(
    `insert into verification_requirements
      (target_id, capability, min_performance, min_novelty, min_consistency, min_timed_performance, min_confidence_evidence, weight)
     values ($1,'arrays_and_strings',0.80,'NOVEL',0.70,0.75,4,1)`,
    [targetId],
  );

  const repo = new PostgresProofRepository(pool);

  const forecast: ForecastSignal = {
    studentId, targetId, readinessForecastPct: 0.79, targetPct: 0.82,
    mainUncertainty: { capability: 'arrays_and_strings', condition: 'TIME_PRESSURE' },
  };
  const forecastAdapter = new DemoForecastAdapter(new Map([[`${studentId}|${targetId}`, forecast]]));

  const weakAttempts: RawAttemptRecord[] = Array.from({ length: 6 }).map((_, i) => ({
    attemptId: `seed_attempt_${i}`,
    studentId,
    capability: 'arrays_and_strings',
    difficulty: i % 2 === 0 ? 'MEDIUM' : 'HARD',
    isCorrect: i < 4,
    performance: i < 4 ? 1 : 0,
    timeTakenMs: 90_000 + i * 5_000,
    expectedTimeMs: 60_000,
    noveltyHint: i < 3 ? 'FAMILIAR' : 'RELATED',
    topic: 'arrays_and_strings',
    occurredAt: new Date(Date.now() - (10 - i) * 86_400_000).toISOString(),
    sourceEvidenceType: 'PRACTICE',
  }));
  const capabilityAdapter = new DemoCapabilityAdapter(new Map([[studentId, weakAttempts]]));

  const service = new ProofService(
    repo, forecastAdapter, new DemoAdaptAdapter(), capabilityAdapter, new HeuristicNoveltyAdapter(),
    new SimulatedExplanationAdapter(),
  );

  console.log('--- Section 55, Steps 1-2: forecast → PROVE MY READINESS ---');
  const { plan, sessionId } = await service.startVerification(studentId, targetId);
  console.log('Plan:', plan.reason);
  if (!sessionId) throw new Error('seed expected a session to be created on the first pass');

  console.log('--- Steps 4-5: simulation — first pass (weak + degrading under time) ---');
  const n = plan.simulationProfile.questionCount;
  for (let i = 0; i < n; i++) {
    await service.recordResponse(studentId, sessionId, {
      questionIndex: i,
      capability: 'arrays_and_strings',
      difficulty: i < n * 0.75 ? 'HARD' : 'TARGET',
      novelty: 'NOVEL',
      isCorrect: i < n * 0.6, // degrades toward the end — Section 12
      timeTakenMs: i < n * 0.25 ? 45_000 : 95_000,
      expectedTimeMs: 60_000,
      skipped: false,
      changedAnswer: false,
      stalled: i > n * 0.75,
    });
  }

  console.log('--- Step 6: result ---');
  const firstResult = await service.completeVerification(studentId, sessionId);
  console.log(`Status: ${firstResult.result.status} | Confidence: ${firstResult.result.confidence}`);
  console.log(firstResult.narrative);

  console.log('--- Step 7: FIX THE GAP -> forwarded to Adapt ---');
  console.log(firstResult.adaptResponse);

  console.log('--- Step 8: student improves (sustained practice over several more sessions) ---');
  const improvedAttempts: RawAttemptRecord[] = [
    ...weakAttempts,
    ...Array.from({ length: 26 }).map((_, i) => ({
      attemptId: `seed_attempt_improved_${i}`,
      studentId,
      capability: 'arrays_and_strings',
      difficulty: 'HARD' as const,
      isCorrect: true,
      performance: 1,
      timeTakenMs: 55_000,
      expectedTimeMs: 60_000,
      noveltyHint: 'NOVEL' as const,
      topic: 'arrays_and_strings',
      occurredAt: new Date(Date.now() - (26 - i) * 3_600_000).toISOString(),
      sourceEvidenceType: 'PRACTICE' as const,
    })),
  ];
  capabilityAdapter.setAttempts(studentId, improvedAttempts);

  console.log('--- Steps 9-10: verify again ---');
  const second = await service.startVerification(studentId, targetId);
  if (second.sessionId) {
    const n2 = second.plan.simulationProfile.questionCount;
    for (let i = 0; i < n2; i++) {
      await service.recordResponse(studentId, second.sessionId, {
        questionIndex: i,
        capability: 'arrays_and_strings',
        difficulty: 'HARD',
        novelty: 'NOVEL',
        isCorrect: true,
        timeTakenMs: 50_000,
        expectedTimeMs: 60_000,
        skipped: false,
        changedAnswer: false,
        stalled: false,
      });
    }
    const secondResult = await service.completeVerification(studentId, second.sessionId);
    console.log('--- Step 11: final status ---');
    console.log(`Status: ${secondResult.result.status} | Confidence: ${secondResult.result.confidence}`);
    console.log(secondResult.narrative);
  } else {
    console.log('Evidence already sufficient — no second session needed:', second.plan.reason);
  }

  console.log('--- Evidence history (Section 30) ---');
  const history = await service.getHistory(studentId, targetId);
  for (const h of history) {
    console.log(`${h.createdAt}: ${h.status} (${h.confidence} confidence, aging: ${h.agingState})`);
  }

  console.log(`\nDemo student id: ${studentId}`);
  console.log(`Demo target id:  ${targetId}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
