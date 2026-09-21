import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { migrate, resetDb } from './helpers/db';
import { createApp } from '../src/api';

const app = createApp();
const auth = { 'x-dev-student-id': 'smoke-student', 'x-dev-tenant-id': 'test-tenant' };

describe('API smoke test: create -> test -> use -> appear in library', () => {
  beforeAll(migrate);
  beforeEach(resetDb);

  it('walks the full personal-shortcut lifecycle through the HTTP API', async () => {
    const create = await request(app)
      .post('/api/shortcuts')
      .set(auth)
      .send({
        canonicalName: 'My Quarter Trick',
        description: 'Divide by 4 for 25%.',
        category: 'Quantitative',
        domain: 'Percentages',
        strategyType: 'PERCENTAGE_TRICK',
        whenToUse: 'Exactly 25%',
        whenNotTo: 'Any other percentage',
        expression: 'x / 4',
        canonicalExpression: 'x * 25 / 100',
        validationDomain: { variables: { x: { min: 0, max: 1000 } } },
      });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe('UNVERIFIED');
    const shortcutId = create.body.shortcutId;

    const test = await request(app).post(`/api/shortcuts/${shortcutId}/test`).set(auth);
    expect(test.status).toBe(200);
    expect(test.body.overallStatus).toBe('PASS');

    const afterTest = await request(app).get(`/api/shortcuts/${shortcutId}`).set(auth);
    expect(afterTest.body.status).toBe('VERIFIED');
    expect(afterTest.body.trustState).toBe('EXPERIMENTAL'); // content is verified; this student hasn't earned personal trust yet

    for (let i = 0; i < 10; i += 1) {
      const usage = await request(app)
        .post('/api/usage')
        .set(auth)
        .send({ shortcutId, correct: true, responseTimeMs: 6000, baselineTimeMs: 18000, mode: 'PRACTICE' });
      expect(usage.status).toBe(201);
    }

    const mine = await request(app).get('/api/shortcuts/mine').set(auth);
    expect(mine.body.trusted.map((s: { shortcutId: string }) => s.shortcutId)).toContain(shortcutId);
  });

  it('recommends nothing during formal assessment, and something sensible during practice', async () => {
    const create = await request(app)
      .post('/api/shortcuts')
      .set(auth)
      .send({
        canonicalName: 'Half Trick',
        strategyType: 'PERCENTAGE_TRICK',
        whenToUse: '50%',
        expression: 'x / 2',
        canonicalExpression: 'x * 50 / 100',
        validationDomain: { variables: { x: { min: 0, max: 1000 } } },
      });
    const shortcutId = create.body.shortcutId;
    await request(app).post(`/api/shortcuts/${shortcutId}/test`).set(auth);
    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post('/api/usage')
        .set(auth)
        .send({ shortcutId, correct: true, responseTimeMs: 5000, baselineTimeMs: 15000, mode: 'PRACTICE' });
    }

    const duringAssessment = await request(app)
      .post('/api/recommendations/strategy')
      .set(auth)
      .send({ context: { attributes: {} }, mode: 'FORMAL_ASSESSMENT' });
    expect(duringAssessment.body.allowed).toBe(false);
    expect(duringAssessment.body.recommended).toBeNull();

    const duringPractice = await request(app)
      .post('/api/recommendations/strategy')
      .set(auth)
      .send({ context: { attributes: {} }, mode: 'PRACTICE' });
    expect(duringPractice.body.allowed).toBe(true);
    expect(duringPractice.body.recommended?.shortcutId).toBe(shortcutId);
  });

  it('runs a training start/submit round trip', async () => {
    const create = await request(app)
      .post('/api/shortcuts')
      .set(auth)
      .send({ canonicalName: 'Decimal Shift', strategyType: 'PERCENTAGE_TRICK' });
    const shortcutId = create.body.shortcutId;

    const started = await request(app).post('/api/training/start').set(auth).send({ activityType: 'RECALL', shortcutId });
    expect(started.status).toBe(200);
    expect(started.body.promptRef).toBeTruthy();

    const submitted = await request(app)
      .post('/api/training/submit')
      .set(auth)
      .send({
        activityType: 'RECALL',
        shortcutId,
        promptRef: started.body.promptRef,
        response: { answer: 'Divide by 10' },
        correct: true,
      });
    expect(submitted.status).toBe(200);
    expect(submitted.body.correct).toBe(1);
  });
});
