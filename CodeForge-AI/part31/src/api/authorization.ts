export type ActorRole = 'student' | 'trainer' | 'tpo_admin' | 'org_admin' | 'system_admin';

/**
 * AuthContext must be constructed by your EXISTING verified
 * authentication/session layer (verified JWT claims, server-side session,
 * etc.) — never from raw client-supplied headers or request body fields
 * (Phase 44: "never accept authoritative values from the frontend").
 * Nothing in this file reads from a request object; that's deliberate.
 */
export interface AuthContext {
  actorId: string;
  actorRole: ActorRole;
  organizationId: string;
}

const STAFF_ROLES: ActorRole[] = ['trainer', 'tpo_admin', 'org_admin', 'system_admin'];
const COHORT_ROLES: ActorRole[] = ['tpo_admin', 'org_admin', 'system_admin'];

/** Tenant isolation (Phase 42) is enforced first, unconditionally, before any role check. */
export function canViewReadiness(
  actor: AuthContext,
  target: { studentId: string; organizationId: string; isSelf: boolean },
): boolean {
  if (actor.organizationId !== target.organizationId) return false;
  if (actor.actorRole === 'student') return target.isSelf;
  return STAFF_ROLES.includes(actor.actorRole);
}

export function canTriggerRecalculation(actor: AuthContext, target: { organizationId: string; isSelf: boolean }): boolean {
  if (actor.organizationId !== target.organizationId) return false;
  if (actor.actorRole === 'student') return target.isSelf;
  return STAFF_ROLES.includes(actor.actorRole);
}

export function canViewCohortAggregate(actor: AuthContext, target: { organizationId: string }): boolean {
  if (actor.organizationId !== target.organizationId) return false;
  return COHORT_ROLES.includes(actor.actorRole);
}
