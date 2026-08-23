import type { ActorContext, UserRole } from "../types/action.types.js";

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

/**
 * Coarse role gate: is this role even allowed to attempt this action category at
 * all? Fine-grained entity/scope authorization (e.g. "your department only")
 * happens per-action in the action definition's own checkPermission, using the
 * helpers below. This function only ever reads `ctx`, which is populated by the
 * authenticated backend session — never by client input or model output
 * (spec section 24: "Never trust: frontend role, LLM decision, client-submitted
 * authorization").
 */
export function requireRole(ctx: ActorContext, allowed: UserRole[]): GuardResult {
  if (!allowed.includes(ctx.role)) {
    return {
      ok: false,
      reason: `Role ${ctx.role} is not permitted to perform this action. Requires one of: ${allowed.join(", ")}.`,
    };
  }
  return { ok: true };
}

/**
 * Restrict a requested department scope down to what the actor is actually
 * authorized for. Per spec section 25, a Department Coordinator whose scope is
 * ["CSE"] asking to act on "all students" gets silently NARROWED to CSE, never
 * broadened, and the caller is told so.
 */
export function resolveDepartmentScope(
  ctx: ActorContext,
  requestedDepartments: string[] | undefined
): { departments: string[] | undefined; narrowed: boolean } {
  // TPO_HEAD / PLACEMENT_OFFICER / ADMIN / MANAGEMENT have institution-wide scope
  // unless the actor context itself carries a department restriction.
  if (!ctx.departments || ctx.departments.length === 0) {
    return { departments: requestedDepartments, narrowed: false };
  }
  if (!requestedDepartments || requestedDepartments.length === 0) {
    return { departments: ctx.departments, narrowed: true };
  }
  const allowed = new Set(ctx.departments);
  const narrowedList = requestedDepartments.filter((d) => allowed.has(d));
  const narrowed = narrowedList.length !== requestedDepartments.length;
  return { departments: narrowedList.length > 0 ? narrowedList : ctx.departments, narrowed };
}

/** A student may only ever act on their own record. */
export function requireOwnStudentRecord(ctx: ActorContext, targetStudentId: string): GuardResult {
  if (ctx.role !== "STUDENT") return { ok: true }; // not a student action path
  if (!ctx.studentId || ctx.studentId !== targetStudentId) {
    return { ok: false, reason: "Students may only act on their own record." };
  }
  return { ok: true };
}
