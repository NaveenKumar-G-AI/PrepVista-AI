'use strict';

/**
 * Roles recognised anywhere in this codebase. Note what is NOT here:
 * there is no RECRUITER role, ever (spec sections 2, 15, 75). A test in
 * tests/permissionGuard.test.js asserts ROLES has no recruiter-shaped key,
 * so this can't silently regress.
 */
const ROLES = Object.freeze({
  TPO_ADMIN: 'TPO_ADMIN',
  DEPT_COORDINATOR: 'DEPT_COORDINATOR',
  MANAGEMENT: 'MANAGEMENT',
  STUDENT: 'STUDENT',
});

class PermissionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PermissionError';
    this.code = code || 'PERMISSION_DENIED';
  }
}

/**
 * Spec section 44: "Never let the LLM determine whether a tool is
 * permitted. The backend decides." This is that decision point. It is
 * called from ToolRegistry.executeTool() — the model never reaches a tool
 * handler without passing through here first, regardless of provider.
 */
function checkToolPermission(user, tool) {
  if (!user || !user.role) {
    throw new PermissionError('No authenticated user context.', 'NO_USER');
  }
  if (!Object.values(ROLES).includes(user.role)) {
    throw new PermissionError(`Unrecognized role "${user.role}".`, 'UNKNOWN_ROLE');
  }
  if (!tool.permissions || !tool.permissions.includes(user.role)) {
    throw new PermissionError(
      `Role ${user.role} is not permitted to call tool "${tool.name}".`,
      'TOOL_NOT_PERMITTED'
    );
  }
  return true;
}

/**
 * Tenant isolation + department scoping (spec sections 73-75, 81).
 * `entity` must at minimum carry `institutionId`; department-scoped roles
 * additionally require a matching `department` field when present on the
 * entity. Student role additionally requires the entity to belong to the
 * requesting student themselves.
 */
function checkEntityScope(user, entity) {
  if (!entity) return true; // aggregate results with no single entity to scope
  if (entity.institutionId && entity.institutionId !== user.institutionId) {
    throw new PermissionError('Entity belongs to a different institution.', 'TENANT_ISOLATION');
  }
  if (user.role === ROLES.DEPT_COORDINATOR && user.departmentScope && entity.department) {
    if (entity.department !== user.departmentScope) {
      throw new PermissionError(
        `Department Coordinator scoped to ${user.departmentScope} cannot access ${entity.department} records.`,
        'DEPARTMENT_SCOPE'
      );
    }
  }
  if (user.role === ROLES.STUDENT) {
    if (entity.studentId && entity.studentId !== user.studentId) {
      throw new PermissionError('Students may only access their own records.', 'SELF_SCOPE');
    }
  }
  return true;
}

/**
 * Field-level data minimization (spec section 54). Sensitive contact/PII
 * fields are stripped from every tool result by default. A tool may opt in
 * to including them via `includeSensitiveFields: true` on its definition,
 * and even then only for TPO_ADMIN — every other role still gets the
 * minimized shape.
 */
const SENSITIVE_FIELD_NAMES = new Set([
  'phone', 'phoneNumber', 'email', 'personalEmail', 'address', 'homeAddress',
  'salary', 'ctcIndividual', 'documents', 'dateOfBirth', 'dob',
  'governmentId', 'aadhaar', 'panNumber', 'bankAccount',
]);

function minimizeFields(data, { tool, user }) {
  const canSeeSensitive = Boolean(tool.includeSensitiveFields) && user.role === ROLES.TPO_ADMIN;
  if (canSeeSensitive) return data;

  const strip = (value) => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (SENSITIVE_FIELD_NAMES.has(k)) continue;
        out[k] = strip(v);
      }
      return out;
    }
    return value;
  };
  return strip(data);
}

module.exports = { ROLES, PermissionError, checkToolPermission, checkEntityScope, minimizeFields };
