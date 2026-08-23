'use strict';

const http = require('http');
const { loadAIConfig } = require('./config');
const { createProvider } = require('./providers/modelRouter');
const { createAuditLog } = require('./security/auditLog');
const { buildToolRegistry } = require('./tools/index');
const { AIPlacementOfficer } = require('./orchestrator');
const { ROLES } = require('./security/permissionGuard');
const { INSTITUTION_ID } = require('./services/mockData');

/**
 * Demo-only user lookup keyed by an X-User-Id header, standing in for real
 * session/auth middleware (which Part 1's auth module owns in production —
 * this file never implements authentication itself, only reads whatever
 * the real auth layer would have already put on the request).
 */
const DEMO_USERS = {
  tpo1: { id: 'tpo1', role: ROLES.TPO_ADMIN, institutionId: INSTITUTION_ID },
  coord_cse: { id: 'coord_cse', role: ROLES.DEPT_COORDINATOR, institutionId: INSTITUTION_ID, departmentScope: 'CSE' },
  mgmt1: { id: 'mgmt1', role: ROLES.MANAGEMENT, institutionId: INSTITUTION_ID },
};

function buildOfficer(env = process.env) {
  const config = loadAIConfig({ AI_PROVIDER: 'mock', ...env, NODE_ENV: env.NODE_ENV || 'development' });
  const provider = createProvider(config);
  const auditLog = createAuditLog();
  const registry = buildToolRegistry({ auditLog });
  return { officer: new AIPlacementOfficer({ provider, registry, config, auditLog }), auditLog };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

function createServer(officer) {
  return http.createServer(async (req, res) => {
    try {
      const user = DEMO_USERS[req.headers['x-user-id']] || DEMO_USERS.tpo1;
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'POST' && url.pathname === '/api/ai/session') {
        const body = await readBody(req);
        return send(res, 200, officer.createSession({ user, route: body.route }));
      }
      if (req.method === 'POST' && url.pathname === '/api/ai/message') {
        const body = await readBody(req);
        const response = await officer.handleMessage({
          sessionId: body.sessionId, user, route: body.route,
          entityRefs: body.entityRefs, filters: body.filters, message: body.message,
        });
        return send(res, 200, response);
      }
      if (req.method === 'GET' && url.pathname === '/api/ai/briefing') {
        return send(res, 200, await officer.generateBriefing({ user }));
      }
      if (req.method === 'POST' && url.pathname === '/api/ai/action/propose') {
        const body = await readBody(req);
        return send(res, 200, await officer.proposeAction({ user, toolName: body.toolName, params: body.params }));
      }
      if (req.method === 'POST' && url.pathname === '/api/ai/action/confirm') {
        const body = await readBody(req);
        return send(res, 200, await officer.confirmAction({ user, proposalId: body.proposalId }));
      }
      send(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
    } catch (err) {
      send(res, 500, { error: err.message });
    }
  });
}

if (require.main === module) {
  const { officer } = buildOfficer();
  const port = Number(process.env.PORT) || 8787;
  createServer(officer).listen(port, () => {
    console.log(`AI Placement Officer API listening on http://localhost:${port}`);
    console.log('Try: curl -X POST localhost:8787/api/ai/session -d "{}"');
  });
}

module.exports = { createServer, buildOfficer, DEMO_USERS };
