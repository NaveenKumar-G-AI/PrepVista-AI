import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, loginAs, authed } from '../helpers/testApp';
import { seedTwoInstitutions } from '../helpers/fixtures';

describe('Audit immutability (spec section 37)', () => {
  let fx: Awaited<ReturnType<typeof seedTwoInstitutions>>;
  before(async () => { fx = await seedTwoInstitutions(); });

  it('an unauthenticated caller is rejected before route matching even occurs', async () => {
    const res = await request(app).put('/api/admin/audit/some-id');
    assert.strictEqual(res.status, 401);
  });

  it('even a fully authorized Super Admin with audit.read has no PUT, PATCH, or DELETE route available — the endpoint simply does not exist', async () => {
    const token = await loginAs(fx.superAdminAlphaEmail, fx.password);
    for (const method of ['put', 'patch', 'delete'] as const) {
      const res = await (request(app) as any)[method]('/api/admin/audit/some-id').set(authed(token));
      assert.strictEqual(res.status, 404, `${method.toUpperCase()} should not be a defined route, even for an authorized admin`);
    }
  });
});
