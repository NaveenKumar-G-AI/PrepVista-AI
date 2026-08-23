import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, loginAs, authed } from '../helpers/testApp';
import { seedTwoInstitutions } from '../helpers/fixtures';
import { setDepartmentActive } from '../../db/repositories/departmentRepo';

describe('Data quality engine (spec sections 26-27, 60)', () => {
  let fx: Awaited<ReturnType<typeof seedTwoInstitutions>>;
  before(async () => { fx = await seedTwoInstitutions(); });

  it('flags a real, triggerable inconsistency rather than reporting a static number', async () => {
    setDepartmentActive(fx.eceAlpha.id, false); // ECE has an active coordinator assigned — a genuine issue

    const token = await loginAs(fx.superAdminAlphaEmail, fx.password);
    const res = await request(app).get('/api/admin/data-quality').set(authed(token));
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.counts.HIGH > 0);
    const match = res.body.issues.find((i: any) => i.entityId === fx.eceAlpha.id);
    assert.ok(match);
    assert.ok(match.reason.includes('ECE'));
  });

  it("never reports another institution's issues", async () => {
    const token = await loginAs(fx.superAdminBetaEmail, fx.password);
    const res = await request(app).get('/api/admin/data-quality').set(authed(token));
    const match = res.body.issues.find((i: any) => i.entityId === fx.eceAlpha.id);
    assert.ok(!match);
  });
});
