import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, loginAs, authed } from '../helpers/testApp';
import { seedTwoInstitutions } from '../helpers/fixtures';

describe('Tenant isolation (spec section 53)', () => {
  let fx: Awaited<ReturnType<typeof seedTwoInstitutions>>;

  before(async () => {
    fx = await seedTwoInstitutions();
  });

  it('Institution A cannot see Institution B users, even as Super Admin', async () => {
    const tokenA = await loginAs(fx.superAdminAlphaEmail, fx.password);
    const res = await request(app).get('/api/admin/users').set(authed(tokenA));
    assert.strictEqual(res.status, 200);
    const emails = res.body.map((u: any) => u.email);
    assert.ok(!emails.includes(fx.superAdminBetaEmail));
    assert.ok(!emails.includes(fx.users.tpoHeadBeta.email));
  });

  it("Institution A's audit log never contains Institution B's events", async () => {
    await loginAs(fx.users.tpoHeadBeta.email, fx.password); // generates a real Beta-side audit event
    const tokenA = await loginAs(fx.superAdminAlphaEmail, fx.password);

    const res = await request(app).get('/api/admin/audit').set(authed(tokenA));
    assert.strictEqual(res.status, 200);
    const actorIds = res.body.events.map((e: any) => e.actorId);
    assert.ok(!actorIds.includes(fx.users.tpoHeadBeta.id));
  });

  it('rejects direct cross-tenant role-change attempts via the API, not just a hidden UI element', async () => {
    const tokenA = await loginAs(fx.superAdminAlphaEmail, fx.password);
    const res = await request(app)
      .patch(`/api/admin/users/${fx.users.tpoHeadBeta.id}/role`)
      .set(authed(tokenA))
      .send({ roleName: 'STUDENT' });
    assert.strictEqual(res.status, 404);
  });

  it('a malformed/tampered token is rejected outright', async () => {
    const tokenA = await loginAs(fx.superAdminAlphaEmail, fx.password);
    const res = await request(app).get('/api/admin/users').set(authed(tokenA + 'x'));
    assert.strictEqual(res.status, 401);
  });
});
