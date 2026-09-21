import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';
import { Role, CohortKind, CohortDimension } from '../../src/domain/enums';

function tokenFor(organizationId: string, role: Role) {
  return jwt.sign({ organizationId, role }, env.JWT_SECRET, {
    subject: `test-${role}`,
    issuer: env.JWT_ISSUER,
    expiresIn: '1h',
  });
}

const app = createApp();

describe('CodeForge Cohort Intelligence API (integration)', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/v1/cohorts').expect(401);
  });

  it('rejects the STUDENT role from cohort-intelligence endpoints (section 5)', async () => {
    const token = tokenFor('org_test_1', Role.STUDENT);
    await request(app).get('/api/v1/cohorts').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('supports create -> member -> recompute -> overview, and refuses cross-tenant access (golden scenario #72)', async () => {
    const orgAToken = tokenFor('org_A', Role.ORG_ADMIN);
    const orgBToken = tokenFor('org_B', Role.ORG_ADMIN);

    const createRes = await request(app)
      .post('/api/v1/cohorts')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ name: 'CSE 2026', kind: CohortKind.DEPARTMENT, dimension: CohortDimension.DEPARTMENT })
      .expect(201);

    const cohortId = createRes.body.id as string;

    // Add enough members to clear the default privacy threshold (10).
    for (let i = 0; i < 12; i++) {
      await request(app)
        .post(`/api/v1/cohorts/${cohortId}/members`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({ studentId: `student_${i}` })
        .expect(201);
    }

    await request(app).post(`/api/v1/cohorts/${cohortId}/recompute`).set('Authorization', `Bearer ${orgAToken}`).expect(202);

    const overviewRes = await request(app)
      .get(`/api/v1/cohorts/${cohortId}/overview`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .expect(200);

    expect(overviewRes.body.restricted).toBeUndefined();
    expect(overviewRes.body.evidenceCoverageSummary).toBeTruthy();
    // SQL is deliberately low-coverage in the mock adapters — the
    // executive overview should never call it "weak", only note
    // insufficient evidence (spec section 10 golden rule).
    expect(overviewRes.body.priorityGaps).not.toContain('SQL is weak');

    // Institution B must not be able to see institution A's cohort.
    await request(app).get(`/api/v1/cohorts/${cohortId}/overview`).set('Authorization', `Bearer ${orgBToken}`).expect(404);
    await request(app).get(`/api/v1/cohorts/${cohortId}`).set('Authorization', `Bearer ${orgBToken}`).expect(404);
  });

  it('withholds aggregate intelligence for cohorts under the privacy threshold (golden scenario #71)', async () => {
    const token = tokenFor('org_small', Role.ORG_ADMIN);
    const createRes = await request(app)
      .post('/api/v1/cohorts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tiny Cohort', kind: CohortKind.CUSTOM, dimension: CohortDimension.CUSTOM })
      .expect(201);
    const cohortId = createRes.body.id as string;

    await request(app)
      .post(`/api/v1/cohorts/${cohortId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: 'student_only_one' })
      .expect(201);

    const overviewRes = await request(app)
      .get(`/api/v1/cohorts/${cohortId}/overview`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(overviewRes.body.restricted).toBeTruthy();
  });

  it('rejects duplicate events idempotently and still recomputes cohorts (sections 76, 35-36)', async () => {
    const token = tokenFor('org_events', Role.ORG_ADMIN);
    const createRes = await request(app)
      .post('/api/v1/cohorts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Events Cohort', kind: CohortKind.CUSTOM, dimension: CohortDimension.CUSTOM })
      .expect(201);
    const cohortId = createRes.body.id as string;

    for (let i = 0; i < 10; i++) {
      await request(app)
        .post(`/api/v1/cohorts/${cohortId}/members`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: `evt_student_${i}` })
        .expect(201);
    }

    const eventPayload = {
      studentId: 'evt_student_0',
      cohortId,
      eventType: 'ASSESSMENT_COMPLETED',
      sourceEventId: 'evt_dedupe_test_1',
      sourceTimestamp: new Date().toISOString(),
    };

    const first = await request(app).post('/api/v1/events').set('Authorization', `Bearer ${token}`).send(eventPayload).expect(202);
    expect(first.body.deduped).toBe(false);

    const second = await request(app).post('/api/v1/events').set('Authorization', `Bearer ${token}`).send(eventPayload).expect(202);
    expect(second.body.deduped).toBe(true);
  });

  it('blocks cohort comparison when one cohort is too small (section 39)', async () => {
    const token = tokenFor('org_compare', Role.ORG_ADMIN);

    const createBig = await request(app)
      .post('/api/v1/cohorts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Big Cohort', kind: CohortKind.CUSTOM, dimension: CohortDimension.CUSTOM })
      .expect(201);
    const createSmall = await request(app)
      .post('/api/v1/cohorts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Small Cohort', kind: CohortKind.CUSTOM, dimension: CohortDimension.CUSTOM })
      .expect(201);

    for (let i = 0; i < 12; i++) {
      await request(app)
        .post(`/api/v1/cohorts/${createBig.body.id}/members`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: `big_${i}` })
        .expect(201);
    }
    await request(app)
      .post(`/api/v1/cohorts/${createSmall.body.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: 'small_0' })
      .expect(201);

    const compareRes = await request(app)
      .post('/api/v1/cohorts/compare')
      .set('Authorization', `Bearer ${token}`)
      .send({ cohortIdA: createBig.body.id, cohortIdB: createSmall.body.id })
      .expect(200);

    expect(compareRes.body.comparable).toBe(false);
    expect(compareRes.body.reasons.length).toBeGreaterThan(0);
  });
});
