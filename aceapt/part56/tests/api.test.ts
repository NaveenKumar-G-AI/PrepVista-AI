import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/api/app';
import {
  InMemoryFormulaRepository,
  InMemoryStudentStateRepository,
  InMemoryTrainingAttemptRepository,
  InMemoryTrainingSessionRepository,
} from '../src/repositories';
import { seedFormulaRepository } from '../src/seed/formulas.seed';

async function buildTestApp() {
  const formulaRepo = new InMemoryFormulaRepository();
  await seedFormulaRepository(formulaRepo);
  return buildApp({
    formulaRepo,
    stateRepo: new InMemoryStudentStateRepository(),
    attemptRepo: new InMemoryTrainingAttemptRepository(),
    sessionRepo: new InMemoryTrainingSessionRepository(),
  });
}

describe('Formula Intelligence Engine API', () => {
  it('boots and answers a health check', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('lists published formulas', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/api/formulas');
    expect(res.status).toBe(200);
    expect(res.body.formulas.length).toBe(3);
  });

  it('withholds full formula content when x-assessment-mode is set (spec sections 85, 172, 232)', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/api/formulas/fx-simple-interest').set('x-assessment-mode', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ formulaId: 'fx-simple-interest', status: 'PUBLISHED' });
    expect(res.body.meaning).toBeUndefined();
    expect(res.body.conditions).toBeUndefined();
  });

  it('serves full formula content outside assessment mode', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/api/formulas/fx-simple-interest');
    expect(res.status).toBe(200);
    expect(res.body.meaning).toBeDefined();
    expect(res.body.relationships.length).toBeGreaterThan(0);
  });

  it('runs a full session -> next activity -> submit attempt -> profile flow', async () => {
    const app = await buildTestApp();
    const startRes = await request(app)
      .post('/api/training/sessions')
      .send({ studentId: 'student-9', formulaId: 'fx-speed-distance-time' });
    expect(startRes.status).toBe(201);
    const sessionId = startRes.body.sessionId;

    const nextRes = await request(app).get(`/api/training/sessions/${sessionId}/next`);
    expect(nextRes.status).toBe(200);
    expect(nextRes.body.activityType).toBeDefined();

    const attemptRes = await request(app).post(`/api/training/sessions/${sessionId}/attempts`).send({
      activityType: 'RECALL',
      presentedFormulaId: 'fx-speed-distance-time',
      correctFormulaId: 'fx-speed-distance-time',
      chosenFormulaId: 'fx-speed-distance-time',
    });
    expect(attemptRes.status).toBe(200);
    expect(attemptRes.body.correct).toBe(true);

    const profileRes = await request(app)
      .get('/api/students/student-9/formula-profile')
      .set('x-user-id', 'student-9')
      .set('x-user-role', 'STUDENT');
    expect(profileRes.status).toBe(200);
  });

  it("blocks a student from reading another student's profile (spec sections 173-174, 235)", async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .get('/api/students/someone-else/formula-profile')
      .set('x-user-id', 'student-9')
      .set('x-user-role', 'STUDENT');
    expect(res.status).toBe(403);
  });

  it('allows a trainer to read any student profile', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .get('/api/students/someone-else/formula-profile')
      .set('x-user-id', 'trainer-1')
      .set('x-user-role', 'TRAINER');
    expect(res.status).toBe(200);
  });

  it('rejects a student attempting to change canonical formula status (spec section 235)', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .patch('/api/admin/formulas/fx-simple-interest/status')
      .set('x-user-id', 'student-9')
      .set('x-user-role', 'STUDENT')
      .send({ status: 'RETIRED' });
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated access to admin routes', async () => {
    const app = await buildTestApp();
    const res = await request(app).patch('/api/admin/formulas/fx-simple-interest/status').send({ status: 'RETIRED' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown formula', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/api/formulas/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed attempt submission', async () => {
    const app = await buildTestApp();
    const startRes = await request(app)
      .post('/api/training/sessions')
      .send({ studentId: 'student-10', formulaId: 'fx-simple-interest' });
    const res = await request(app)
      .post(`/api/training/sessions/${startRes.body.sessionId}/attempts`)
      .send({ activityType: 'NOT_A_REAL_TYPE' });
    expect(res.status).toBe(400);
  });
});
