import request from 'supertest';
import { createServer } from '../src/api/server';
import { ModelCapability, Priority, Role, TaskType } from '../src/types';

const app = createServer();

function devAuth(role: Role, userId = 'user1', organizationId = 'org1') {
  return JSON.stringify({ userId, organizationId, role });
}

/**
 * These tests run against the real Express app with the app's shared
 * singletons (same instances src/index.ts would wire up) — this is
 * deliberately an HTTP-level smoke test of the wiring itself (route
 * mounting, middleware order, RBAC), not a re-test of business logic
 * already covered unit-by-unit elsewhere (see tests/*.test.ts). It runs
 * with NODE_ENV=test (set automatically by Jest) and no JWT_SECRET, which
 * is exactly the condition that enables the x-dev-auth fallback described
 * in src/api/middleware/auth.ts — this fallback is unavailable whenever
 * NODE_ENV=production, by design.
 */
describe('HTTP server — auth and routing wiring', () => {
  it('GET /healthz requires no auth and reports service status', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.persistence).toMatch(/in-memory/);
  });

  it('rejects an unauthenticated request to a protected route', async () => {
    const res = await request(app).post('/api/execute').send({});
    expect(res.status).toBe(401);
  });

  it('rejects a malformed dev-auth header', async () => {
    const res = await request(app).post('/api/execute').set('x-dev-auth', '{not valid json').send({});
    expect(res.status).toBe(401);
  });

  it('a valid execute request round-trips through the whole gateway and returns a structured result', async () => {
    const res = await request(app)
      .post('/api/execute')
      .set('x-dev-auth', devAuth(Role.STUDENT))
      .send({
        feature: 'code-review',
        task: TaskType.CODE_ANALYSIS,
        priority: Priority.INTERACTIVE,
        requiredCapabilities: [ModelCapability.GENERAL],
        messages: [{ role: 'user', content: 'Please review this code.' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUCCESS');
    expect(res.body.model.provider).toBe('mock');
  });

  it('rejects an execute request with an invalid body via the same error shape as other validation errors', async () => {
    const res = await request(app).post('/api/execute').set('x-dev-auth', devAuth(Role.STUDENT)).send({ task: 'NOT_A_REAL_TASK' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('a STUDENT role cannot reach dashboard/analytics endpoints', async () => {
    const res = await request(app).get('/api/analytics/overview').set('x-dev-auth', devAuth(Role.STUDENT));
    expect(res.status).toBe(403);
  });

  it('an ORG_ADMIN role can reach dashboard/analytics endpoints and gets a real (non-fake) empty-state overview', async () => {
    const res = await request(app).get('/api/analytics/overview').set('x-dev-auth', devAuth(Role.ORG_ADMIN, 'admin1', 'brand-new-org-for-this-test'));
    expect(res.status).toBe(200);
    expect(res.body.totalRequests).toBe(0); // a fresh org has genuinely made zero requests — not a placeholder number
    expect(res.body.totalCostUsd).toBeNull();
  });

  it('GET /api/models is readable by DASHBOARD_ROLES and includes the seeded model registry', async () => {
    const res = await request(app).get('/api/models').set('x-dev-auth', devAuth(Role.ENGINEERING_OPERATOR));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((m: { id: string }) => m.id === 'mock:test-model')).toBe(true);
  });

  it('GET /api/providers/health reports provider status without requiring real API keys', async () => {
    const res = await request(app).get('/api/providers/health').set('x-dev-auth', devAuth(Role.ENGINEERING_OPERATOR));
    expect(res.status).toBe(200);
    const anthropic = res.body.find((p: { provider: string }) => p.provider === 'anthropic');
    expect(anthropic.status).toBe('UNAVAILABLE'); // no ANTHROPIC_API_KEY configured in this environment
  });

  it('a non-admin role cannot mutate policy', async () => {
    const res = await request(app)
      .put('/api/policies')
      .set('x-dev-auth', devAuth(Role.ORG_ADMIN))
      .send({ scope: 'ORGANIZATION', scopeRef: 'org1', config: { maxRetries: 1 } });
    expect(res.status).toBe(403);
  });

  it('an ENGINEERING_OPERATOR can set an organization policy, and it is rejected if invalid', async () => {
    const badRes = await request(app)
      .put('/api/policies')
      .set('x-dev-auth', devAuth(Role.ENGINEERING_OPERATOR))
      .send({ scope: 'ORGANIZATION', scopeRef: 'org1', config: { allowedModels: ['not-a-real-model-id'] } });
    expect(badRes.status).toBe(422);

    const goodRes = await request(app)
      .put('/api/policies')
      .set('x-dev-auth', devAuth(Role.ENGINEERING_OPERATOR))
      .send({ scope: 'ORGANIZATION', scopeRef: 'org1', config: { maxRetries: 1 } });
    expect(goodRes.status).toBe(200);
  });

  it('the emergency kill switch is disabled at the HTTP layer until an operator configures a passphrase', async () => {
    const res = await request(app)
      .post('/api/admin/emergency/kill-switch')
      .set('x-dev-auth', devAuth(Role.PLATFORM_ADMIN))
      .send({ activate: true, confirm: true, passphrase: 'whatever' });
    expect(res.status).toBe(503); // EMERGENCY_CONTROL_PASSPHRASE not set in this environment
  });

  it('a non-emergency role cannot reach emergency endpoints at all', async () => {
    const res = await request(app)
      .post('/api/admin/emergency/bulk-pause')
      .set('x-dev-auth', devAuth(Role.ORG_ADMIN))
      .send({ paused: true });
    expect(res.status).toBe(403);
  });
});
