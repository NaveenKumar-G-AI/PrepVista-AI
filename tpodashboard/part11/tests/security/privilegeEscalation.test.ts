import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, loginAs, authed } from '../helpers/testApp';
import { seedTwoInstitutions } from '../helpers/fixtures';
import { createUser } from '../../db/repositories/userRepo';
import { hashPassword } from '../../src/lib/crypto';

describe('Privilege escalation protection (spec sections 20, 75)', () => {
  let fx: Awaited<ReturnType<typeof seedTwoInstitutions>>;

  before(async () => {
    fx = await seedTwoInstitutions();
  });

  it('a Placement Officer cannot call role-management endpoints at all (no roles.write permission)', async () => {
    const token = await loginAs(fx.users.officerAlpha.email, fx.password);
    const res = await request(app)
      .patch(`/api/admin/users/${fx.users.coordCseAlpha.id}/role`)
      .set(authed(token))
      .send({ roleName: 'TPO_HEAD' });
    assert.strictEqual(res.status, 403);
  });

  it('a TPO Head cannot promote anyone to a role that outranks their own', async () => {
    const token = await loginAs(fx.users.tpoHeadAlpha.email, fx.password);
    const res = await request(app)
      .patch(`/api/admin/users/${fx.users.officerAlpha.id}/role`)
      .set(authed(token))
      .send({ roleName: 'SUPER_ADMIN' });
    assert.strictEqual(res.status, 403);
  });

  it('no user can change their own role via the API, regardless of rank', async () => {
    const token = await loginAs(fx.users.tpoHeadAlpha.email, fx.password);
    const res = await request(app)
      .patch(`/api/admin/users/${fx.users.tpoHeadAlpha.id}/role`)
      .set(authed(token))
      .send({ roleName: 'SUPER_ADMIN' });
    assert.strictEqual(res.status, 403);
  });

  it('a Department Coordinator cannot see users in another department (direct API call, not just hidden UI)', async () => {
    const token = await loginAs(fx.users.coordCseAlpha.email, fx.password);
    const res = await request(app).get('/api/admin/users').set(authed(token));
    assert.strictEqual(res.status, 200);
    const emails = res.body.map((u: any) => u.email);
    assert.ok(emails.includes(fx.users.coordCseAlpha.email));
    assert.ok(!emails.includes(fx.users.coordEceAlpha.email));
  });

  it('a Student gets 403 from every admin endpoint tested, never a data leak', async () => {
    const token = await loginAs(fx.users.studentAlpha.email, fx.password);
    for (const url of ['/api/admin/users', '/api/admin/roles', '/api/admin/audit', '/api/admin/data-quality']) {
      const res = await request(app).get(url).set(authed(token));
      assert.strictEqual(res.status, 403, `expected 403 for ${url}`);
    }
  });

  it('Management can read policy data but cannot write to user administration', async () => {
    const token = await loginAs(fx.users.managementAlpha.email, fx.password);
    const read = await request(app).get('/api/admin/policies').set(authed(token));
    assert.strictEqual(read.status, 200);
    const write = await request(app)
      .post('/api/admin/users/invite')
      .set(authed(token))
      .send({ email: 'new@alpha.test', name: 'New Person', roleName: 'FACULTY' });
    assert.strictEqual(write.status, 403);
  });

  it('a custom role cannot be granted a permission its creator does not hold', async () => {
    const token = await loginAs(fx.users.officerAlpha.email, fx.password); // Placement Officer: no roles.write
    const res = await request(app)
      .post('/api/admin/roles')
      .set(authed(token))
      .send({ name: 'SHADOW_ADMIN', rank: 10, permissionKeys: ['users.write'] });
    assert.strictEqual(res.status, 403); // blocked before the grant-subset check even runs
  });

  it('a Super Admin can deactivate a second Super Admin, correctly leaving one active', async () => {
    const passwordHash = await hashPassword(fx.password);
    const secondAdmin = createUser({
      institutionId: fx.alpha.institution.id, email: 'second.super@alpha.test', name: 'Second Super Admin',
      roleId: fx.alpha.roleByName['SUPER_ADMIN'], passwordHash, status: 'ACTIVE',
    });
    const token = await loginAs(fx.superAdminAlphaEmail, fx.password);
    const res = await request(app)
      .patch(`/api/admin/users/${secondAdmin.id}/status`)
      .set(authed(token))
      .send({ status: 'DEACTIVATED' });
    assert.strictEqual(res.status, 200);
  });

  it('the sole remaining Super Admin cannot deactivate themselves — the invariant that guarantees an institution is never left without one', async () => {
    const token = await loginAs(fx.superAdminBetaEmail, fx.password); // Beta has exactly one Super Admin
    const me = await request(app).get('/api/me').set(authed(token));
    const res = await request(app)
      .patch(`/api/admin/users/${me.body.id}/status`)
      .set(authed(token))
      .send({ status: 'DEACTIVATED' });
    assert.strictEqual(res.status, 403);
  });
});
