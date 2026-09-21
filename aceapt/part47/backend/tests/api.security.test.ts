import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signDevToken } from '../src/api/middleware/auth.js';
import { buildTestService, makeTestDataDir } from './helpers/testService.js';

describe('HTTP API - authentication and ownership (Section 111: "Student A requests Student B session -> denied")', () => {
  it('rejects requests with no bearer token at all', async () => {
    const app = createApp(buildTestService(makeTestDataDir()));
    const res = await request(app).get('/api/guided/sessions/whatever');
    expect(res.status).toBe(401);
  });

  it('rejects a session lookup for a session owned by a different student', async () => {
    const app = createApp(buildTestService(makeTestDataDir()));
    const tokenA = signDevToken('student-a');
    const tokenB = signDevToken('student-b');

    const startRes = await request(app)
      .post('/api/guided/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemId: 'sdt-train-360-60' });
    expect(startRes.status).toBe(201);
    const sessionId = startRes.body.session.sessionId;

    const intruderRes = await request(app).get(`/api/guided/sessions/${sessionId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(intruderRes.status).toBe(403);

    const ownerRes = await request(app).get(`/api/guided/sessions/${sessionId}`).set('Authorization', `Bearer ${tokenA}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.session.sessionId).toBe(sessionId);
  });

  it('rejects a step submission targeting a session owned by a different student', async () => {
    const app = createApp(buildTestService(makeTestDataDir()));
    const tokenA = signDevToken('student-a2');
    const tokenB = signDevToken('student-b2');
    const startRes = await request(app)
      .post('/api/guided/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ problemId: 'pct-marks-45-60' });
    const sessionId = startRes.body.session.sessionId;

    const res = await request(app)
      .post(`/api/guided/sessions/${sessionId}/steps/understand/submit`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ rawInput: 'percentage' });
    expect(res.status).toBe(403);
  });

  it('rejects a forged/garbage bearer token', async () => {
    const app = createApp(buildTestService(makeTestDataDir()));
    const res = await request(app).get('/api/guided/sessions/whatever').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('HTTP API - happy path end to end', () => {
  it('starts a session, submits a correct step, and returns 200 with a CORRECT result', async () => {
    const app = createApp(buildTestService(makeTestDataDir()));
    const token = signDevToken('student-happy');
    const startRes = await request(app)
      .post('/api/guided/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: 'pct-marks-45-60' });
    expect(startRes.status).toBe(201);
    const sessionId = startRes.body.session.sessionId;

    const submitRes = await request(app)
      .post(`/api/guided/sessions/${sessionId}/steps/understand/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rawInput: 'percentage' });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.result).toBe('CORRECT');
  });

  it('returns a validation error for a malformed request body instead of a 500', async () => {
    const app = createApp(buildTestService(makeTestDataDir()));
    const token = signDevToken('student-badbody');
    const res = await request(app).post('/api/guided/sessions').set('Authorization', `Bearer ${token}`).send({ notAProblemId: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
