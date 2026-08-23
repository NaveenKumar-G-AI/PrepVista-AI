'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildToolRegistry } = require('../src/tools/index');
const { createAuditLog } = require('../src/security/auditLog');
const { ROLES } = require('../src/security/permissionGuard');
const { INSTITUTION_ID, students } = require('../src/services/mockData');

test('a student asking "show all students" is denied outright (spec section 81)', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const student = { id: 'stu_0001', role: ROLES.STUDENT, institutionId: INSTITUTION_ID, studentId: 'stu_0001' };
  const result = await registry.executeTool('search_students', {}, student);
  assert.equal(result.success, false);
  assert.equal(result.code, 'TOOL_NOT_PERMITTED');
});

test('a Department Coordinator asking for another department is silently scoped to their own, not denied outright', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const coordinator = { id: 'u_coord', role: ROLES.DEPT_COORDINATOR, institutionId: INSTITUTION_ID, departmentScope: 'CSE' };
  const result = await registry.executeTool('search_students', { department: 'ECE' }, coordinator);
  assert.equal(result.success, true);
  assert.ok(result.data.items.every((s) => s.department === 'CSE'), 'requested ECE, but scope must force CSE regardless');
});

test('department scope also applies to list tools whose items are not student records themselves (spec section 74; found in hostile review SEC-5)', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const coordinator = { id: 'u_coord', role: ROLES.DEPT_COORDINATOR, institutionId: INSTITUTION_ID, departmentScope: 'CSE' };
  const offers = await registry.executeTool('get_offers', {}, coordinator);
  assert.equal(offers.success, true);
  assert.ok(offers.data.items.length > 0, 'sanity check: CSE should have at least one offer in the fixture');
  assert.ok(offers.data.items.every((o) => o.department === 'CSE'));

  const improvers = await registry.executeTool('get_top_improvers', {}, coordinator);
  assert.equal(improvers.success, true);
  assert.ok(improvers.data.items.every((i) => i.department === 'CSE'));
});

test('Management asking for private per-student notes has no matching tool available to it', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const management = { id: 'u_mgmt', role: ROLES.MANAGEMENT, institutionId: INSTITUTION_ID };
  const attempt = await registry.executeTool('get_student', { studentId: students[0].id }, management);
  assert.equal(attempt.success, false);
  assert.equal(attempt.code, 'TOOL_NOT_PERMITTED');
});

test('TPO_ADMIN within scope succeeds (control case)', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const admin = { id: 'u_admin', role: ROLES.TPO_ADMIN, institutionId: INSTITUTION_ID };
  const result = await registry.executeTool('get_student', { studentId: students[0].id }, admin);
  assert.equal(result.success, true);
  assert.equal(result.data.id, students[0].id);
});

test('a request scoped to a foreign institution ID never returns this institution\'s data', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const foreignAdmin = { id: 'u_other', role: ROLES.TPO_ADMIN, institutionId: 'inst_other_college' };
  const result = await registry.executeTool('search_students', {}, foreignAdmin);
  assert.equal(result.success, true);
  assert.equal(result.data.items.length, 0, 'A different institution\'s admin must see zero of this institution\'s students');
});

test('permission denials are recorded to the audit log (spec section 96 AI_PERMISSION_DENIED)', async () => {
  const auditLog = createAuditLog();
  const registry = buildToolRegistry({ auditLog });
  const student = { id: 'stu_0001', role: ROLES.STUDENT, institutionId: INSTITUTION_ID, studentId: 'stu_0001' };
  await registry.executeTool('search_students', {}, student);
  const denials = auditLog.list({ event: 'AI_PERMISSION_DENIED' });
  assert.ok(denials.length >= 1);
});
