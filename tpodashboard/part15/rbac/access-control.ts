/**
 * PrepVista AI — Part 15
 *
 * RBAC boundary. Exactly three roles exist: TPO, MANAGEMENT, STUDENT.
 * There is no RECRUITER role anywhere in this codebase — not in the ROLES
 * constant, not in a route, not in a table. That is a deliberate invariant
 * (Section 1 / 6), not an oversight, and tests/strategy/noRecruiterRole.test.ts
 * asserts it directly so a future edit can't reintroduce one silently.
 *
 * Institutional-strategy functions (forecasts, target gaps, recommendations,
 * company intelligence) require TPO or MANAGEMENT. Every one of them MUST
 * call `assertInstitutionalAccess` before touching repository data — that's
 * the single choke point tests/strategy/studentBoundary.test.ts exercises.
 */

import { ROLES, type CallerContext, type Role } from "../types/placement-strategy.types.js";

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertValidRole(role: string): asserts role is Role {
  if (!(ROLES as readonly string[]).includes(role)) {
    throw new AuthorizationError(`Unknown role: ${role}`);
  }
}

/** Institutional strategic data — TPO and MANAGEMENT only. Students are never permitted here, no matter what they ask for. */
export function assertInstitutionalAccess(caller: CallerContext): void {
  assertValidRole(caller.role);
  if (caller.role !== "TPO" && caller.role !== "MANAGEMENT") {
    throw new AuthorizationError(
      `Role '${caller.role}' cannot access institutional strategic data. This endpoint is restricted to TPO and MANAGEMENT.`
    );
  }
}

/** TPO-only actions (e.g. accepting a recommendation into an action, running outreach intelligence). */
export function assertTpoAccess(caller: CallerContext): void {
  assertValidRole(caller.role);
  if (caller.role !== "TPO") {
    throw new AuthorizationError(`Role '${caller.role}' cannot perform this TPO-only action.`);
  }
}

/** Student-scoped personal endpoints — a student may only ever read their OWN data. */
export function assertOwnStudentAccess(caller: CallerContext, requestedStudentId: string): void {
  assertValidRole(caller.role);
  if (caller.role !== "STUDENT") {
    // TPO/MANAGEMENT are allowed to look up a student's personal outlook for
    // advising purposes — but never the reverse (student -> institutional data).
    return;
  }
  if (caller.studentId !== requestedStudentId) {
    throw new AuthorizationError("Students may only access their own personal outlook.");
  }
}
