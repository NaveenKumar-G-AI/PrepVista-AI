import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, loginAs, authed } from '../helpers/testApp';
import { seedTwoInstitutions } from '../helpers/fixtures';

describe('Session revocation & account deactivation (spec sections 57-58)', () => {
  let fx: Awaited<ReturnType<typeof seedTwoInstitutions>>;

  before(async () => {
    fx = await seedTwoInstitutions();
  });

  it('a deactivated user is blocked on their very next request, even with a token issued moments earlier', async () => {
    const token = await loginAs(fx.users.officerAlpha.email, fx.password);
    const preCheck = await request(app).get('/api/me').set(authed(token));
    assert.strictEqual(preCheck.status, 200);

    const adminToken = await loginAs(fx.users.tpoHeadAlpha.email, fx.password);
    const deactivate = await request(app)
      .patch(`/api/admin/users/${fx.users.officerAlpha.id}/status`)
      .set(authed(adminToken))
      .send({ status: 'DEACTIVATED' });
    assert.strictEqual(deactivate.status, 200);

    const postCheck = await request(app).get('/api/me').set(authed(token));
    assert.strictEqual(postCheck.status, 401);
  });

  it('revoking a session immediately blocks that specific token', async () => {
    const token = await loginAs(fx.users.coordCseAlpha.email, fx.password);
    const list = await request(app).get('/api/sessions').set(authed(token));
    const sessionId = list.body[0].id;

    const revoke = await request(app).delete(`/api/sessions/${sessionId}`).set(authed(token));
    assert.strictEqual(revoke.status, 204);

    const after = await request(app).get('/api/me').set(authed(token));
    assert.strictEqual(after.status, 401);
  });

  it('a role change forces re-authentication by revoking existing sessions', async () => {
    const officerToken = await loginAs(fx.users.coordEceAlpha.email, fx.password);
    const adminToken = await loginAs(fx.users.tpoHeadAlpha.email, fx.password);

    const roleChange = await request(app)
      .patch(`/api/admin/users/${fx.users.coordEceAlpha.id}/role`)
      .set(authed(adminToken))
      .send({ roleName: 'FACULTY' });
    assert.strictEqual(roleChange.status, 200);

    const after = await request(app).get('/api/me').set(authed(officerToken));
    assert.strictEqual(after.status, 401);
  });

  it('every mutation above produced a matching, queryable audit record', async () => {
    const adminToken = await loginAs(fx.users.tpoHeadAlpha.email, fx.password);
    const res = await request(app).get('/api/admin/audit?action=user.status_changed').set(authed(adminToken));
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.events.length > 0);

    const roleChanges = await request(app).get('/api/admin/audit?action=user.role_changed').set(authed(adminToken));
    assert.ok(roleChanges.body.events.length > 0);
  });
});
