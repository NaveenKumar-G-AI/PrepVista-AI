import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, loginAs, authed } from '../helpers/testApp';
import { seedTwoInstitutions } from '../helpers/fixtures';

describe('Policy versioning (spec sections 22-23, 65)', () => {
  let fx: Awaited<ReturnType<typeof seedTwoInstitutions>>;
  before(async () => { fx = await seedTwoInstitutions(); });

  it('creates version 1, then version 2 that supersedes it, preserving full history', async () => {
    const token = await loginAs(fx.superAdminAlphaEmail, fx.password);

    const v1 = await request(app).post('/api/admin/policies/multiple_offer_policy').set(authed(token))
      .send({ config: { maxActiveOffers: 2 }, effectiveDate: new Date().toISOString() });
    assert.strictEqual(v1.status, 201);
    assert.strictEqual(v1.body.version, 1);

    const v2 = await request(app).post('/api/admin/policies/multiple_offer_policy').set(authed(token))
      .send({ config: { maxActiveOffers: 1 }, effectiveDate: new Date().toISOString(), reason: 'Tightening policy per management directive' });
    assert.strictEqual(v2.status, 201);
    assert.strictEqual(v2.body.version, 2);

    const history = await request(app).get('/api/admin/policies/multiple_offer_policy/history').set(authed(token));
    assert.strictEqual(history.body.length, 2);
    assert.strictEqual(history.body.find((p: any) => p.version === 1).status, 'SUPERSEDED');
    assert.strictEqual(history.body.find((p: any) => p.version === 2).status, 'ACTIVE');
  });

  it('a Placement Officer can read policies but not write them', async () => {
    const token = await loginAs(fx.users.officerAlpha.email, fx.password);
    const read = await request(app).get('/api/admin/policies').set(authed(token));
    assert.strictEqual(read.status, 200);
    const write = await request(app).post('/api/admin/policies/withdrawal_policy').set(authed(token))
      .send({ config: {}, effectiveDate: new Date().toISOString() });
    assert.strictEqual(write.status, 403);
  });
});
