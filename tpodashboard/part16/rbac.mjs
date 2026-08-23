// PrepVista AI — Role × Resource × Action matrix (Part 16 §10)
//
// Tenant match is checked before anything else, unconditionally — no role,
// including tpo_head, can see across institutions. See §8.
//
// §38 — AI/Part 14 action permissions must be derived from this same
// table, never granted independently. confirmAction() in
// aiOrchestration.mjs calls can('approve','ai_action', ...) for exactly
// this reason: an AI actor should never be able to do something the human
// confirming it couldn't do themselves.
//
// There is deliberately no 'recruiter' role. §1 is explicit: recruiters
// are TPO-managed external records, never platform users.
// assertNotRecruiterRole exists so a future migration or import can't
// quietly create one.

const FORBIDDEN_ROLES = new Set(['recruiter', 'company', 'company_admin', 'employer']);

export function assertNotRecruiterRole(role) {
  if (FORBIDDEN_ROLES.has(role)) {
    throw new Error(
      `"${role}" is not a PrepVista role (Part 16 §1). Recruiters are TPO-managed ` +
      `external records only — no recruiter login, portal, or dashboard.`
    );
  }
}

// §10 defines these six roles and their scopes directly (quoted almost
// verbatim below). §45–51's experience audits are the behavioral check —
// walk this matrix against real screens too, not just this file.
export const MATRIX = {
  tpo_head: {
    student: { view: 'all', create: 'all', update: 'all', export: 'all' },
    company: { view: 'all', create: 'all', update: 'all' },
    drive: { view: 'all', create: 'all', update: 'all', approve: 'all' },
    application: { view: 'all', update: 'all' },
    interview: { view: 'all', create: 'all', update: 'all' },
    offer: { view: 'all', create: 'all', update: 'all', approve: 'all' },
    joining: { view: 'all', update: 'all', approve: 'all' },
    training: { view: 'all', create: 'all', update: 'all' },
    readiness: { view: 'all' },
    communication: { view: 'all', create: 'all' },
    report: { view: 'all', export: 'all' },
    forecast: { view: 'all' },
    ai_action: { view: 'all', create: 'all', approve: 'all' },
    proactive_signal: { view: 'all' },
    audit: { view: 'all' },
    user: { view: 'all', create: 'all', update: 'all' },
  },
  placement_officer: {
    student: { view: 'all', update: 'all' },
    company: { view: 'all', create: 'all', update: 'all' },
    drive: { view: 'all', create: 'all', update: 'all' },
    application: { view: 'all', update: 'all' },
    interview: { view: 'all', create: 'all', update: 'all' },
    offer: { view: 'all', create: 'all', update: 'all' },
    joining: { view: 'all', update: 'all' },
    training: { view: 'all', update: 'all' },
    readiness: { view: 'all' },
    communication: { view: 'all', create: 'all' },
    report: { view: 'all' },
    forecast: { view: 'all' },
    ai_action: { view: 'all', create: 'all' }, // no 'approve' — TPO Head confirms, not PO
    proactive_signal: { view: 'all' },
  },
  department_coordinator: {
    student: { view: 'own_department', update: 'own_department' },
    drive: { view: 'own_department' },
    application: { view: 'own_department' },
    interview: { view: 'own_department' },
    offer: { view: 'own_department' },
    joining: { view: 'own_department' },
    training: { view: 'own_department', update: 'own_department' },
    readiness: { view: 'own_department' },
    communication: { view: 'own_department', create: 'own_department' },
    report: { view: 'own_department' },
  },
  faculty: {
    student: { view: 'assigned_only' },
    training: { view: 'assigned_only', update: 'assigned_only' },
    readiness: { view: 'assigned_only' },
    communication: { view: 'assigned_only', create: 'assigned_only' },
  },
  management: {
    // Institutional oversight, not unrestricted administration — §10.
    student: { view: 'all' },
    drive: { view: 'all' },
    application: { view: 'all' },
    offer: { view: 'all' },
    joining: { view: 'all' },
    training: { view: 'all' },
    readiness: { view: 'all' },
    report: { view: 'all', export: 'all' },
    forecast: { view: 'all' },
    proactive_signal: { view: 'all' },
  },
  student: {
    student: { view: 'own_data', update: 'own_data' },
    drive: { view: 'all' }, // published drives — filtered upstream, not an RBAC scope
    application: { view: 'own_data', create: 'own_data', update: 'own_data' },
    interview: { view: 'own_data' },
    offer: { view: 'own_data', update: 'own_data' },
    joining: { view: 'own_data', update: 'own_data' },
    training: { view: 'own_data' },
    readiness: { view: 'own_data' },
    communication: { view: 'own_data' },
  },
};

/**
 * auth:   { actorId, role, institutionId, departmentId? }
 * target: { institutionId, departmentId?, ownerStudentId?, assignedActorIds? }
 *
 * For a student-role actor, actorId should be their *student* id — that's
 * what own_data compares against. See fixtures/seed.mjs.
 */
export function can(action, resource, auth, target) {
  if (auth.institutionId !== target.institutionId) return false; // §8, unconditional, first

  const scope = MATRIX[auth.role]?.[resource]?.[action];
  if (!scope || scope === 'none') return false;

  switch (scope) {
    case 'all':
      return true;
    case 'own_department':
      return !!auth.departmentId && auth.departmentId === target.departmentId;
    case 'own_data':
      return !!target.ownerStudentId && target.ownerStudentId === auth.actorId;
    case 'assigned_only':
      return !!target.assignedActorIds?.includes(auth.actorId);
    default:
      return false;
  }
}
