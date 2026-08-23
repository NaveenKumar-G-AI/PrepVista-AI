'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, checkToolPermission, checkEntityScope, minimizeFields, PermissionError } = require('../src/security/permissionGuard');

test('ROLES never includes a recruiter role (spec sections 2, 15, 75)', () => {
  const keys = Object.keys(ROLES).map((k) => k.toLowerCase());
  const values = Object.values(ROLES).map((v) => v.toLowerCase());
  assert.ok(!keys.some((k) => k.includes('recruit')));
  assert.ok(!values.some((v) => v.includes('recruit')));
});

test('checkToolPermission denies a role not listed on the tool', () => {
  const tool = { name: 'get_student', permissions: [ROLES.TPO_ADMIN] };
  const user = { role: ROLES.STUDENT };
  assert.throws(() => checkToolPermission(user, tool), PermissionError);
});

test('checkToolPermission allows a listed role', () => {
  const tool = { name: 'get_student', permissions: [ROLES.TPO_ADMIN, ROLES.DEPT_COORDINATOR] };
  assert.equal(checkToolPermission({ role: ROLES.DEPT_COORDINATOR }, tool), true);
});

test('checkToolPermission rejects an unrecognized role outright (no implicit STUDENT/recruiter escalation)', () => {
  const tool = { name: 'get_student', permissions: [ROLES.TPO_ADMIN] };
  assert.throws(() => checkToolPermission({ role: 'RECRUITER' }, tool), PermissionError);
});

test('checkEntityScope enforces tenant isolation across institutions', () => {
  const user = { role: ROLES.TPO_ADMIN, institutionId: 'inst_a' };
  const foreignEntity = { institutionId: 'inst_b' };
  assert.throws(() => checkEntityScope(user, foreignEntity), (err) => err.code === 'TENANT_ISOLATION');
});

test('checkEntityScope enforces department scope for a Department Coordinator', () => {
  const coordinator = { role: ROLES.DEPT_COORDINATOR, institutionId: 'inst_a', departmentScope: 'CSE' };
  const otherDeptEntity = { institutionId: 'inst_a', department: 'ECE' };
  assert.throws(() => checkEntityScope(coordinator, otherDeptEntity), (err) => err.code === 'DEPARTMENT_SCOPE');
  const ownDeptEntity = { institutionId: 'inst_a', department: 'CSE' };
  assert.equal(checkEntityScope(coordinator, ownDeptEntity), true);
});

test('checkEntityScope restricts a STUDENT to their own record', () => {
  const student = { role: ROLES.STUDENT, institutionId: 'inst_a', studentId: 'stu_1' };
  assert.throws(() => checkEntityScope(student, { institutionId: 'inst_a', studentId: 'stu_2' }), (err) => err.code === 'SELF_SCOPE');
  assert.equal(checkEntityScope(student, { institutionId: 'inst_a', studentId: 'stu_1' }), true);
});

test('minimizeFields strips sensitive contact fields by default', () => {
  const tool = { includeSensitiveFields: false };
  const user = { role: ROLES.TPO_ADMIN };
  const data = { id: 'stu_1', displayName: 'X', phone: '+91-999', email: 'x@y.com' };
  const out = minimizeFields(data, { tool, user });
  assert.equal(out.phone, undefined);
  assert.equal(out.email, undefined);
  assert.equal(out.id, 'stu_1');
});

test('minimizeFields only reveals sensitive fields for TPO_ADMIN + an opted-in tool', () => {
  const data = { id: 'stu_1', phone: '+91-999' };
  const optedInTool = { includeSensitiveFields: true };
  assert.equal(minimizeFields(data, { tool: optedInTool, user: { role: ROLES.TPO_ADMIN } }).phone, '+91-999');
  assert.equal(minimizeFields(data, { tool: optedInTool, user: { role: ROLES.DEPT_COORDINATOR } }).phone, undefined);
  const notOptedIn = { includeSensitiveFields: false };
  assert.equal(minimizeFields(data, { tool: notOptedIn, user: { role: ROLES.TPO_ADMIN } }).phone, undefined);
});
