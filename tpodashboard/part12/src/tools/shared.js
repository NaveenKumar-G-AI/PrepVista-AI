'use strict';

const { ROLES } = require('../security/permissionGuard');

const TPO_ROLES = [ROLES.TPO_ADMIN, ROLES.DEPT_COORDINATOR];
const TPO_AND_MANAGEMENT = [ROLES.TPO_ADMIN, ROLES.DEPT_COORDINATOR, ROLES.MANAGEMENT];
const MANAGEMENT_ONLY_AGGREGATE = [ROLES.TPO_ADMIN, ROLES.MANAGEMENT];

/**
 * A Department Coordinator's department filter is never taken from the
 * request — it is always the coordinator's own assigned department,
 * regardless of what a caller (model or client) asked for. This is what
 * makes spec section 74 ("two TPOs with different scopes get different
 * answers") true even if a compromised or confused caller tries to widen
 * the request.
 */
function scopedDept(user, requestedDept) {
  if (user.role === ROLES.DEPT_COORDINATOR && user.departmentScope) return user.departmentScope;
  return requestedDept;
}

/** Same idea applied to a result object keyed by department name (e.g. department readiness/report tools). */
function scopedDeptReport(user, byDeptObject) {
  if (user.role === ROLES.DEPT_COORDINATOR && user.departmentScope) {
    return { [user.departmentScope]: byDeptObject[user.departmentScope] };
  }
  return byDeptObject;
}

module.exports = { ROLES, TPO_ROLES, TPO_AND_MANAGEMENT, MANAGEMENT_ONLY_AGGREGATE, scopedDept, scopedDeptReport };
