import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/api/server.js';
import { closeAllPools } from '../src/db/pool.js';
import { makeSuperPool, createTenantFixture, createQuestionVersion, insertAttempt, type Fixture } from './helpers/fixtures.js';

describe('Express API (supertest, live Postgres underneath)', () => {
  const app = createApp();
  const superPool = makeSuperPool();
  let fixture: Fixture;
  let adminToken: string;
  let studentToken: string;
  let otherTenantAdminToken: string;

  beforeAll(async () => {
    fixture = await createTenantFixture(superPool);
    const other = await createTenantFixture(superPool);
    const secret = process.env.AUTH_JWT_SECRET!;
    adminToken = jwt.sign({ tenantId: fixture.tenantId, role: 'ADMIN', userId: 'admin-1' }, secret);
    studentToken = jwt.sign({ tenantId: fixture.tenantId, role: 'STUDENT', userId: 'student-1' }, secret);
    otherTenantAdminToken = jwt.sign({ tenantId: other.tenantId, role: 'ADMIN', userId: 'admin-2' }, secret);
  });

  afterAll(async () => {
    await superPool.end();
    await closeAllPools();
  });

  it('rejects requests with no auth at all', async () => {
    const res = await request(app).get('/api/difficulty/admin/calibration-center/summary');
    expect(res.status).toBe(401);
  });

  it('rejects a student calling an admin endpoint', async () => {
    const res = await request(app)
      .get('/api/difficulty/admin/calibration-center/summary')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('allows an admin to read the calibration center summary', async () => {
    const res = await request(app)
      .get('/api/difficulty/admin/calibration-center/summary')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
  });

  it('lazily seeds and returns a provisional difficulty for a brand-new question', async () => {
    const qv = await createQuestionVersion(superPool, fixture, { initialLabel: 'Medium' });
    const res = await request(app)
      .get(`/api/difficulty/admin/questions/${qv}/difficulty`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PROVISIONAL');
  });

  it("an admin from tenant B cannot read or trigger calibration for tenant A's question version", async () => {
    const qv = await createQuestionVersion(superPool, fixture, { initialLabel: 'Medium' });
    await insertAttempt(superPool, fixture, qv);
    // Seed it under the correct tenant first.
    const seeded = await request(app)
      .get(`/api/difficulty/admin/questions/${qv}/difficulty`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(seeded.status).toBe(200);

    const res = await request(app)
      .get(`/api/difficulty/admin/questions/${qv}/difficulty`)
      .set('Authorization', `Bearer ${otherTenantAdminToken}`);
    // RLS hides tenant A's snapshot from tenant B entirely, so the controller
    // takes the lazy-seed path — which must itself refuse to touch a
    // question_version_id that doesn't belong to tenant B's own tenant_id
    // (see the tenant_id check added to calibrateQuestionVersion after this
    // exact scenario produced a live uq_active_snapshot crash during
    // testing — cross-tenant access must fail closed, never fail INTO
    // another tenant's data).
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toContain(fixture.tenantId);
  });

  it('a student reading their own difficulty view never receives a facility field', async () => {
    const qv = await createQuestionVersion(superPool, fixture, { initialLabel: 'Medium' });
    for (let i = 0; i < 40; i++) await insertAttempt(superPool, fixture, qv, { isCorrect: Math.random() < 0.3 });
    await request(app).get(`/api/difficulty/admin/questions/${qv}/difficulty`).set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app)
      .get(`/api/difficulty/student/questions/${qv}/difficulty`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('facility');
    expect(res.body).not.toHaveProperty('sampleSize');
    expect(res.body).toHaveProperty('category');
  });

  it('rejects a malformed/forged token', async () => {
    const res = await request(app)
      .get('/api/difficulty/admin/calibration-center/summary')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });
});
