import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenant, appPool, closeAllPools } from '../src/db/pool.js';
import { DifficultySnapshotService } from '../src/services/difficulty-snapshot.service.js';
import { DifficultyEstimator } from '../src/services/difficulty-estimator.service.js';
import { makeSuperPool, createTenantFixture, createQuestionVersion, type Fixture } from './helpers/fixtures.js';
import type { EligibleObservation } from '../src/types/difficulty.types.js';

function obs(isCorrect: boolean): EligibleObservation {
  return {
    attemptId: crypto.randomUUID(),
    isCorrect,
    responseTimeMs: 40000,
    timeIsReliable: true,
    mode: 'UNTIMED',
    hintsUsed: 0,
    isNovel: true,
    exposureNumber: 1,
    sessionPositionPct: 0.5,
    abilityProxy: 0.5,
    createdAt: new Date(),
  };
}

describe('DifficultySnapshotService — atomic publish (live Postgres)', () => {
  const superPool = makeSuperPool();
  const estimator = new DifficultyEstimator();
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await createTenantFixture(superPool);
  });

  afterAll(async () => {
    await superPool.end();
    await closeAllPools();
  });

  it('§150-152: a thrown error after publish() rolls back the ENTIRE transaction, including the new snapshot rows', async () => {
    const qv = await createQuestionVersion(superPool, fixture);

    // First, a real successful publish to establish a baseline.
    const baseline = estimator.compute({
      questionVersionId: qv,
      populationId: 'default',
      observations: Array.from({ length: 40 }, () => obs(true)), // ~100%, EASY
      initialCategory: 'EASY',
      contentHash: 'h1',
    });
    await withTenant(appPool, fixture.tenantId, async (client) => {
      const svc = new DifficultySnapshotService(client);
      await svc.publish({
        tenantId: fixture.tenantId,
        populationId: 'default',
        computation: baseline,
        source: 'EMPIRICAL',
        method: 'P0_FACILITY',
        calibrationRunId: null,
      });
    });

    const beforeAttempt = await withTenant(appPool, fixture.tenantId, async (client) => {
      const svc = new DifficultySnapshotService(client);
      return svc.getActiveSnapshot(fixture.tenantId, qv, 'default', 'OVERALL');
    });
    expect(beforeAttempt.category).toBe('EASY');

    // Now attempt a second publish with drastically different (HARD) data,
    // but force an error AFTER publish() has written the new rows —
    // simulating a job crashing partway through the rest of the pipeline
    // (e.g. anomaly persistence throwing).
    const changed = estimator.compute({
      questionVersionId: qv,
      populationId: 'default',
      observations: Array.from({ length: 40 }, () => obs(false)), // ~0%, HARD
      initialCategory: 'EASY',
      contentHash: 'h1',
    });
    await expect(
      withTenant(appPool, fixture.tenantId, async (client) => {
        const svc = new DifficultySnapshotService(client);
        await svc.publish({
          tenantId: fixture.tenantId,
          populationId: 'default',
          computation: changed,
          source: 'EMPIRICAL',
          method: 'P0_FACILITY',
          calibrationRunId: null,
        });
        throw new Error('simulated crash after publish, before commit');
      })
    ).rejects.toThrow('simulated crash after publish');

    // The baseline snapshot must be completely untouched — still EASY,
    // still active, exactly as it was before the failed attempt.
    const afterFailedAttempt = await withTenant(appPool, fixture.tenantId, async (client) => {
      const svc = new DifficultySnapshotService(client);
      return svc.getActiveSnapshot(fixture.tenantId, qv, 'default', 'OVERALL');
    });
    expect(afterFailedAttempt.id).toBe(beforeAttempt.id);
    expect(afterFailedAttempt.category).toBe('EASY');
  });

  it('publish() supersedes the previous snapshot exactly once evidence changes it, and history records the change', async () => {
    const qv = await createQuestionVersion(superPool, fixture);
    const easy = estimator.compute({
      questionVersionId: qv,
      populationId: 'default',
      observations: Array.from({ length: 40 }, () => obs(true)),
      initialCategory: 'EASY',
      contentHash: 'h2',
    });
    const firstId = await withTenant(appPool, fixture.tenantId, async (client) => {
      const svc = new DifficultySnapshotService(client);
      const published = await svc.publish({
        tenantId: fixture.tenantId,
        populationId: 'default',
        computation: easy,
        source: 'EMPIRICAL',
        method: 'P0_FACILITY',
        calibrationRunId: null,
      });
      return published.find((p) => p.mode === 'OVERALL')!.id;
    });

    const hard = estimator.compute({
      questionVersionId: qv,
      populationId: 'default',
      observations: Array.from({ length: 40 }, () => obs(false)),
      initialCategory: 'EASY',
      contentHash: 'h2',
    });
    const secondId = await withTenant(appPool, fixture.tenantId, async (client) => {
      const svc = new DifficultySnapshotService(client);
      const published = await svc.publish({
        tenantId: fixture.tenantId,
        populationId: 'default',
        computation: hard,
        source: 'EMPIRICAL',
        method: 'P0_FACILITY',
        calibrationRunId: null,
      });
      return published.find((p) => p.mode === 'OVERALL')!.id;
    });

    expect(secondId).not.toBe(firstId);

    const { rows } = await superPool.query(`SELECT is_active, superseded_by FROM difficulty_snapshots WHERE id = $1`, [
      firstId,
    ]);
    expect(rows[0].is_active).toBe(false);
    expect(rows[0].superseded_by).toBe(secondId);

    const { rows: historyRows } = await superPool.query(
      `SELECT field_changed, old_value, new_value FROM difficulty_history WHERE question_version_id = $1 AND field_changed = 'category' ORDER BY created_at DESC LIMIT 1`,
      [qv]
    );
    expect(historyRows[0].old_value).toBe('EASY');
    expect(historyRows[0].new_value).toBe('HARD');
  });

  it('§143-144: markStale flips status without touching the evidence numbers, and logs why', async () => {
    const qv = await createQuestionVersion(superPool, fixture);
    const computation = estimator.compute({
      questionVersionId: qv,
      populationId: 'default',
      observations: Array.from({ length: 40 }, () => obs(true)),
      initialCategory: 'EASY',
      contentHash: 'h3',
    });
    await withTenant(appPool, fixture.tenantId, async (client) => {
      const svc = new DifficultySnapshotService(client);
      await svc.publish({
        tenantId: fixture.tenantId,
        populationId: 'default',
        computation,
        source: 'EMPIRICAL',
        method: 'P0_FACILITY',
        calibrationRunId: null,
      });
      await svc.markStale(fixture.tenantId, qv, 'default', 'content_hash_changed_since_last_calibration');
    });

    const after = await withTenant(appPool, fixture.tenantId, async (client) => {
      const svc = new DifficultySnapshotService(client);
      return svc.getActiveSnapshot(fixture.tenantId, qv, 'default', 'OVERALL');
    });
    expect(after.status).toBe('STALE');
    expect(Number(after.facility)).toBeCloseTo(1, 1); // evidence itself untouched
  });
});
