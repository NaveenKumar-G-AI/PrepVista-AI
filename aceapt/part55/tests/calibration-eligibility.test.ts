import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type pg from 'pg';
import { withTenant, appPool, closeAllPools } from '../src/db/pool.js';
import { CalibrationEligibilityService } from '../src/services/calibration-eligibility.service.js';
import { SqlValidationGate } from '../src/integrations/feature54-validation.adapter.js';
import { SqlQualityGate } from '../src/integrations/feature53-quality.adapter.js';
import { PassthroughNoveltyAdapter } from '../src/integrations/feature49-novelty.adapter.js';
import { makeSuperPool, createTenantFixture, createQuestionVersion, insertAttempt, type Fixture } from './helpers/fixtures.js';

describe('CalibrationEligibilityService (live Postgres)', () => {
  const superPool = makeSuperPool();
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await createTenantFixture(superPool);
  });

  afterAll(async () => {
    await superPool.end();
    await closeAllPools();
  });

  async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    return withTenant(appPool, fixture.tenantId, fn);
  }

  it('§22: excludes ALL attempts on an invalid question version', async () => {
    const qv = await createQuestionVersion(superPool, fixture, { isValid: false });
    await insertAttempt(superPool, fixture, qv, { isCorrect: true });
    await insertAttempt(superPool, fixture, qv, { isCorrect: false });

    const result = await withClient((client) => {
      const svc = new CalibrationEligibilityService(
        client,
        new SqlValidationGate(client, fixture.tenantId),
        new SqlQualityGate(client, fixture.tenantId),
        new PassthroughNoveltyAdapter()
      );
      return svc.getEligibleObservations(qv, { tenantId: fixture.tenantId });
    });

    expect(result.questionVersionValid).toBe(false);
    expect(result.eligible).toHaveLength(0);
  });

  it('§23: excludes ALL attempts when Feature 53 quality is POOR', async () => {
    const qv = await createQuestionVersion(superPool, fixture, { qualityStatus: 'POOR' });
    await insertAttempt(superPool, fixture, qv);

    const result = await withClient((client) => {
      const svc = new CalibrationEligibilityService(
        client,
        new SqlValidationGate(client, fixture.tenantId),
        new SqlQualityGate(client, fixture.tenantId),
        new PassthroughNoveltyAdapter()
      );
      return svc.getEligibleObservations(qv, { tenantId: fixture.tenantId });
    });

    expect(result.qualityBlocksCalibration).toBe(true);
    expect(result.eligible).toHaveLength(0);
  });

  it('§104: excludes test-account attempts but keeps regular ones', async () => {
    const qv = await createQuestionVersion(superPool, fixture);
    await insertAttempt(superPool, fixture, qv, { studentId: fixture.testStudentId });
    await insertAttempt(superPool, fixture, qv);
    await insertAttempt(superPool, fixture, qv);

    const result = await withClient((client) => {
      const svc = new CalibrationEligibilityService(
        client,
        new SqlValidationGate(client, fixture.tenantId),
        new SqlQualityGate(client, fixture.tenantId),
        new PassthroughNoveltyAdapter()
      );
      return svc.getEligibleObservations(qv, { tenantId: fixture.tenantId });
    });

    expect(result.eligible).toHaveLength(2);
    expect(result.excluded.some((e) => e.reason === 'TEST_ACCOUNT')).toBe(true);
  });

  it('§104: excludes incomplete attempts', async () => {
    const qv = await createQuestionVersion(superPool, fixture);
    await insertAttempt(superPool, fixture, qv, { completed: false });
    await insertAttempt(superPool, fixture, qv, { completed: true });

    const result = await withClient((client) => {
      const svc = new CalibrationEligibilityService(
        client,
        new SqlValidationGate(client, fixture.tenantId),
        new SqlQualityGate(client, fixture.tenantId),
        new PassthroughNoveltyAdapter()
      );
      return svc.getEligibleObservations(qv, { tenantId: fixture.tenantId });
    });

    expect(result.eligible).toHaveLength(1);
    expect(result.excluded.some((e) => e.reason === 'INCOMPLETE')).toBe(true);
  });

  it('§105: impossible timing keeps the attempt eligible for facility but marks time unreliable', async () => {
    const qv = await createQuestionVersion(superPool, fixture);
    await insertAttempt(superPool, fixture, qv, { responseTimeMs: 10 }); // 10ms, below the floor
    await insertAttempt(superPool, fixture, qv, { responseTimeMs: 45000 });

    const result = await withClient((client) => {
      const svc = new CalibrationEligibilityService(
        client,
        new SqlValidationGate(client, fixture.tenantId),
        new SqlQualityGate(client, fixture.tenantId),
        new PassthroughNoveltyAdapter()
      );
      return svc.getEligibleObservations(qv, { tenantId: fixture.tenantId });
    });

    expect(result.eligible).toHaveLength(2); // both still count toward facility
    const unreliable = result.eligible.find((o) => o.responseTimeMs === 10);
    expect(unreliable?.timeIsReliable).toBe(false);
  });
});
