'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildToolRegistry } = require('../src/tools/index');
const { createAuditLog } = require('../src/security/auditLog');
const { ROLES } = require('../src/security/permissionGuard');
const { INSTITUTION_ID } = require('../src/services/mockData');

function tpo() {
  return { id: 'u_tpo', role: ROLES.TPO_ADMIN, institutionId: INSTITUTION_ID };
}

test('every successful tool result carries a source envelope with module, tool name, and timestamp', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const result = await registry.executeTool('get_data_quality', {}, tpo());
  assert.equal(result.success, true);
  assert.equal(result.source.module, 'DATA_QUALITY');
  assert.equal(result.source.tool, 'get_data_quality');
  assert.ok(new Date(result.source.generated_at).toString() !== 'Invalid Date');
});

test('asking about a company that does not exist returns a clean null, not a fabricated record (spec section 79)', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const result = await registry.executeTool('get_company', { name: 'Company Z' }, tpo());
  assert.equal(result.success, true);
  assert.equal(result.data, null, 'A nonexistent company must resolve to null, never an invented record');
});

test('a student ID that does not exist returns null rather than a made-up profile', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const result = await registry.executeTool('get_student', { studentId: 'stu_9999' }, tpo());
  assert.equal(result.success, true);
  assert.equal(result.data, null);
});

test('training effectiveness explicitly flags when assessment data covers fewer students than completed (spec section 31)', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const result = await registry.executeTool('get_training_effectiveness', { programId: 'train_comm_bootcamp' }, tpo());
  assert.equal(result.success, true);
  assert.equal(result.data.completions, 18);
  assert.equal(result.data.assessedCount, 6);
  assert.equal(result.data.dataSufficient, false);
  assert.match(result.data.note, /18 completions/);
  assert.match(result.data.note, /only 6/);
});

test('a fully-assessed program carries no insufficiency note', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const result = await registry.executeTool('get_training_effectiveness', { programId: 'train_dsa_sprint' }, tpo());
  assert.equal(result.success, true);
  assert.equal(result.data.dataSufficient, true);
  assert.equal(result.data.note, null);
});
