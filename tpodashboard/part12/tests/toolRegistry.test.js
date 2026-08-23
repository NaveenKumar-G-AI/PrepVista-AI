'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ToolRegistry } = require('../src/tools/registry');
const { createAuditLog } = require('../src/security/auditLog');
const { ROLES } = require('../src/security/permissionGuard');
const { SAFETY_LEVELS } = require('../src/security/actionSafety');
const { buildToolRegistry } = require('../src/tools/index');

function freshRegistry() {
  return new ToolRegistry({ auditLog: createAuditLog() });
}

test('unknown tool name returns a structured error instead of throwing', async () => {
  const registry = freshRegistry();
  const result = await registry.executeTool('does_not_exist', {}, { id: 'u1', role: ROLES.TPO_ADMIN, institutionId: 'i1' });
  assert.equal(result.success, false);
  assert.equal(result.code, 'UNKNOWN_TOOL');
});

test('invalid input is rejected before the handler ever runs', async () => {
  const registry = freshRegistry();
  let handlerCalled = false;
  registry.registerTool({
    name: 'needs_id',
    description: 'test',
    category: 'STUDENTS',
    permissions: [ROLES.TPO_ADMIN],
    safetyLevel: SAFETY_LEVELS.READ,
    inputSchema: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string' } } },
    handler: async () => {
      handlerCalled = true;
      return {};
    },
  });
  const result = await registry.executeTool('needs_id', {}, { id: 'u1', role: ROLES.TPO_ADMIN, institutionId: 'i1' });
  assert.equal(result.success, false);
  assert.equal(result.code, 'INVALID_INPUT');
  assert.equal(handlerCalled, false);
});

test('a tool rejects an unexpected extra field the handler was not built for', async () => {
  const registry = freshRegistry();
  registry.registerTool({
    name: 'strict_tool',
    description: 'test',
    category: 'STUDENTS',
    permissions: [ROLES.TPO_ADMIN],
    safetyLevel: SAFETY_LEVELS.READ,
    inputSchema: { type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } },
    handler: async () => ({}),
  });
  const result = await registry.executeTool('strict_tool', { a: 'ok', smuggledParam: 'x' }, { id: 'u1', role: ROLES.TPO_ADMIN, institutionId: 'i1' });
  assert.equal(result.success, false);
  assert.equal(result.code, 'INVALID_INPUT');
});

test('a WRITE-tier tool refuses a direct call and only runs with opts.confirmed', async () => {
  const registry = freshRegistry();
  registry.registerTool({
    name: 'writes_something',
    description: 'test',
    category: 'COMMUNICATION',
    permissions: [ROLES.TPO_ADMIN],
    safetyLevel: SAFETY_LEVELS.SENSITIVE_WRITE,
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    handler: async () => ({ sent: true }),
  });
  const user = { id: 'u1', role: ROLES.TPO_ADMIN, institutionId: 'i1' };
  const direct = await registry.executeTool('writes_something', {}, user);
  assert.equal(direct.success, false);
  assert.equal(direct.code, 'CONFIRMATION_REQUIRED');

  const confirmed = await registry.executeTool('writes_something', {}, user, {}, { confirmed: true });
  assert.equal(confirmed.success, true);
});

test('listTools only shows tools the given role is permitted to call', () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const studentTools = registry.listTools({ role: ROLES.STUDENT });
  assert.equal(studentTools.length, 0, 'STUDENT role has no tools registered in this Part 12 pass (by design — see truth table)');

  const tpoTools = registry.listTools({ role: ROLES.TPO_ADMIN });
  assert.ok(tpoTools.length > 30);

  const managementTools = registry.listTools({ role: ROLES.MANAGEMENT });
  assert.ok(managementTools.every((t) => ['REPORTS', 'READINESS', 'INTERVIEWS', 'JOINING', 'POLICIES', 'DATA_QUALITY'].includes(t.category)));
  assert.ok(!managementTools.some((t) => t.name === 'get_student'), 'Management must not see individual-student tools');
});

test('a list-scoped tool result never leaks another tenant\'s records even if the mock service returned them', async () => {
  const registry = freshRegistry();
  registry.registerTool({
    name: 'list_students_unsafe_source',
    description: 'test',
    category: 'STUDENTS',
    permissions: [ROLES.TPO_ADMIN],
    safetyLevel: SAFETY_LEVELS.READ,
    scopeMode: 'list',
    listPath: 'items',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    // Simulates a buggy/compromised handler that returns cross-tenant data.
    handler: async () => ({ items: [{ institutionId: 'inst_a', id: 's1' }, { institutionId: 'inst_b', id: 's2' }] }),
  });
  const user = { id: 'u1', role: ROLES.TPO_ADMIN, institutionId: 'inst_a' };
  const result = await registry.executeTool('list_students_unsafe_source', {}, user);
  assert.equal(result.success, true);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].institutionId, 'inst_a');
  assert.match(result.source.note, /omitted/);
});
