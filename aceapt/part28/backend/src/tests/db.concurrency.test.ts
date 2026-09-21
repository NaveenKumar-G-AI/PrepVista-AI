// A genuine concurrent race against real Postgres — not simulated. Needs
// migrations already applied (see db.rls.test.ts for connection details).

import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresProofRepository } from '../repositories/postgresProofRepository.js';
import { ProofService } from '../services/proofService.js';
import { SimulatedExplanationAdapter } from '../adapters/simulatedExplanationAdapter.js';
import {
  DemoForecastAdapter, DemoAdaptAdapter, DemoCapabilityAdapter, HeuristicNoveltyAdapter,
} from '../adapters/demoAdapters.js';

const { Pool } = pg;

const adminPool = new Pool({
  host: process.env.PROOF_DB_HOST ?? 'localhost',
  port: Number(process.env.PROOF_DB_PORT ?? 5432),
  database: process.env.PROOF_DB_NAME ?? 'aceapt_proof',
  user: process.env.PROOF_DB_ADMIN_USER ?? 'postgres',
  password: process.env.PROOF_DB_ADMIN_PASSWORD ?? 'postgres',
});

const appPool = new Pool({
  host: process.env.PROOF_DB_HOST ?? 'localhost',
  port: Number(process.env.PROOF_DB_PORT ?? 5432),
  database: process.env.PROOF_DB_NAME ?? 'aceapt_proof',
  user: 'proof_app',
  password: 'proof_app_dev_password',
  max: 10, // needs enough real connections to run the race genuinely concurrently
});

afterAll(async () => {
  await adminPool.end();
  await appPool.end();
});

describe('Concurrent session completion (real Postgres, real race)', () => {
  it('is idempotent under a 5-way race: exactly one caller processes the session, the rest see the same saved result', async () => {
    const studentId = randomUUID();
    const targetId = randomUUID();
    await adminPool.query('insert into students (id, full_name) values ($1,$2)', [studentId, 'Concurrency Test Student']);
    await adminPool.query('insert into verification_targets (id, student_id, role_name) values ($1,$2,$3)', [targetId, studentId, 'role']);
    await adminPool.query(
      `insert into verification_requirements (target_id, capability, min_performance, min_novelty, min_consistency, min_timed_performance)
       values ($1,'arrays',0.8,'NOVEL',0.7,0.75)`,
      [targetId],
    );

    const repo = new PostgresProofRepository(appPool);
    const service = new ProofService(
      repo, new DemoForecastAdapter(new Map()), new DemoAdaptAdapter(), new DemoCapabilityAdapter(new Map()),
      new HeuristicNoveltyAdapter(), new SimulatedExplanationAdapter(),
    );

    const { sessionId } = await service.startVerification(studentId, targetId);
    expect(sessionId).not.toBeNull();
    await service.recordResponse(studentId, sessionId!, {
      questionIndex: 0, capability: 'arrays', difficulty: 'HARD', novelty: 'NOVEL', isCorrect: true,
      timeTakenMs: 50_000, expectedTimeMs: 60_000, skipped: false, changedAnswer: false, stalled: false,
    });

    const RACE_WIDTH = 5;
    const outcomes = await Promise.all(
      Array.from({ length: RACE_WIDTH }).map(() => service.completeVerification(studentId, sessionId!)),
    );

    const freshCount = outcomes.filter((o) => !o.alreadyCompleted).length;
    const repeatCount = outcomes.filter((o) => o.alreadyCompleted).length;
    expect(freshCount).toBe(1);
    expect(repeatCount).toBe(RACE_WIDTH - 1);

    const resultIds = new Set(outcomes.map((o) => o.result.id));
    expect(resultIds.size).toBe(1);

    const onlyResultId = [...resultIds][0]!;
    const { rows: resultRows } = await adminPool.query(
      'select count(*) as c from verification_results where session_id = $1', [sessionId],
    );
    const { rows: snapshotRows } = await adminPool.query(
      'select count(*) as c from proof_snapshots where result_id = $1', [onlyResultId],
    );
    expect(Number(resultRows[0].c)).toBe(1);
    expect(Number(snapshotRows[0].c)).toBe(1);
  }, 30_000);
});
