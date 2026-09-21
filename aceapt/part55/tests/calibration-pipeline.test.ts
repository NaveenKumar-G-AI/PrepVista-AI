import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appPool, closeAllPools } from '../src/db/pool.js';
import { DifficultyCalibrationService } from '../src/services/difficulty-calibration.service.js';
import { InitialDifficultyAiAdapter } from '../src/ai/initial-difficulty-ai.adapter.js';
import { StudentDifficultyReadService, derivePersonalChallenge } from '../src/services/student-difficulty-read.service.js';
import { studentPool } from '../src/db/pool.js';
import {
  makeSuperPool,
  createTenantFixture,
  createQuestionVersion,
  insertAttempt,
  type Fixture,
} from './helpers/fixtures.js';

describe('DifficultyCalibrationService — full pipeline (live Postgres)', () => {
  const superPool = makeSuperPool();
  let fixture: Fixture;
  let service: DifficultyCalibrationService;

  beforeAll(async () => {
    fixture = await createTenantFixture(superPool);
    // useAi=false: these tests exercise the deterministic pipeline, not the
    // network-dependent AI adapter (that path has its own coverage where
    // ANTHROPIC_API_KEY is deliberately set to a bad value — see README).
    service = new DifficultyCalibrationService(appPool, new InitialDifficultyAiAdapter(), false);
  });

  afterAll(async () => {
    await superPool.end();
    await closeAllPools();
  });

  it('§204: a brand-new question with zero attempts still returns a provisional result, not an error', async () => {
    const qv = await createQuestionVersion(superPool, fixture, { initialLabel: 'Medium' });
    const result = await service.calibrateQuestionVersion(fixture.tenantId, qv);
    expect(result.skipped).toBe(false);
    expect(result.status).toBe('PROVISIONAL');
    expect(result.category).toBe('Medium'.toUpperCase());
  });

  it('§177: an invalid question is skipped entirely, run still marked SUCCEEDED (this is policy, not failure)', async () => {
    const qv = await createQuestionVersion(superPool, fixture, { isValid: false });
    await insertAttempt(superPool, fixture, qv, { isCorrect: true });
    const result = await service.calibrateQuestionVersion(fixture.tenantId, qv);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('QUESTION_INVALID');

    const { rows } = await superPool.query(`SELECT status FROM difficulty_calibration_runs WHERE id = $1`, [result.runId]);
    expect(rows[0].status).toBe('SUCCEEDED');
  });

  it('produces a CALIBRATED HARD snapshot with a LABEL_MISMATCH anomaly when evidence contradicts an Easy label', async () => {
    const qv = await createQuestionVersion(superPool, fixture, { initialLabel: 'Easy' });
    for (let i = 0; i < 50; i++) {
      await insertAttempt(superPool, fixture, qv, { isCorrect: Math.random() < 0.08 });
    }
    const result = await service.calibrateQuestionVersion(fixture.tenantId, qv);
    expect(result.status).toBe('CALIBRATED');
    expect(result.category).toBe('HARD');
    expect(result.anomaliesDetected).toContain('LABEL_MISMATCH');

    const anomalies = await service.getAnomalies(fixture.tenantId, { type: 'LABEL_MISMATCH' });
    expect(anomalies.some((a: { question_version_id: string }) => a.question_version_id === qv)).toBe(true);
  });

  it('§193: a second run within the cache TTL is skipped as CACHE_FRESH', async () => {
    const qv = await createQuestionVersion(superPool, fixture);
    await insertAttempt(superPool, fixture, qv, { isCorrect: true });
    const first = await service.calibrateQuestionVersion(fixture.tenantId, qv);
    expect(first.skipped).toBe(false);

    const second = await service.calibrateQuestionVersion(fixture.tenantId, qv);
    expect(second.skipped).toBe(true);
    expect(second.skipReason).toBe('CACHE_FRESH');
  });

  it('§194: force:true bypasses the cache and recalculates', async () => {
    const qv = await createQuestionVersion(superPool, fixture);
    await insertAttempt(superPool, fixture, qv, { isCorrect: true });
    await service.calibrateQuestionVersion(fixture.tenantId, qv);
    const forced = await service.calibrateQuestionVersion(fixture.tenantId, qv, { force: true });
    expect(forced.skipped).toBe(false);
  });

  it('§121/§158: getDifficultyHistory returns an auditable trail after a recalibration', async () => {
    const qv = await createQuestionVersion(superPool, fixture, { initialLabel: 'Easy' });
    for (let i = 0; i < 40; i++) await insertAttempt(superPool, fixture, qv, { isCorrect: true });
    await service.calibrateQuestionVersion(fixture.tenantId, qv);
    for (let i = 0; i < 40; i++) await insertAttempt(superPool, fixture, qv, { isCorrect: false });
    await service.calibrateQuestionVersion(fixture.tenantId, qv, { force: true });

    const history = await service.getDifficultyHistory(fixture.tenantId, qv);
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((h: { reason: string }) => typeof h.reason === 'string' && h.reason.length > 0)).toBe(true);
  });

  it('§115/§156-157: the student read path never exposes facility/sample size, only category', async () => {
    const qv = await createQuestionVersion(superPool, fixture, { initialLabel: 'Medium' });
    for (let i = 0; i < 40; i++) await insertAttempt(superPool, fixture, qv, { isCorrect: Math.random() < 0.2 });
    await service.calibrateQuestionVersion(fixture.tenantId, qv);

    const studentSvc = new StudentDifficultyReadService(studentPool);
    const view = await studentSvc.getDifficulty(fixture.tenantId, qv);
    expect(view).not.toBeNull();
    expect(view!.category).toBe('HARD');
    expect(Object.keys(view!)).toEqual(['questionVersionId', 'category', 'isWellEstablished']);
  });

  it('§79: derivePersonalChallenge never mutates the global category, only labels it relative to the student', () => {
    expect(derivePersonalChallenge('MEDIUM', 'ABOVE')).toBe('BELOW_LEVEL');
    expect(derivePersonalChallenge('MEDIUM', 'AT')).toBe('AT_LEVEL');
    expect(derivePersonalChallenge('MEDIUM', 'BELOW')).toBe('STRETCH');
    expect(derivePersonalChallenge(null, 'AT')).toBeNull();
  });
});
