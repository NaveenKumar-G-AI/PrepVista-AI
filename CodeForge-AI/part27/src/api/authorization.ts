/**
 * Authorization (section 53-54). This module owns exactly one decision:
 * "may requestingUserId see studentId's growth data?" — it does not
 * decide who counts as an instructor for whom; that judgement is
 * delegated to an injected AuthorizationProvider backed by CodeForge's
 * real instructor/role tables, because this package doesn't have access
 * to that schema. DenyAllAuthorizationProvider is the safe default: wire
 * a real provider before instructor endpoints go live, don't silently
 * fall back to "authorized".
 */

export interface AuthorizationProvider {
  isAuthorizedInstructorFor(requestingUserId: string, studentId: string): Promise<boolean>;
}

export class DenyAllAuthorizationProvider implements AuthorizationProvider {
  async isAuthorizedInstructorFor(): Promise<boolean> {
    return false;
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Not authorized to access this growth data') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export async function assertAuthorized(requestingUserId: string, studentId: string, authz: AuthorizationProvider): Promise<void> {
  if (requestingUserId === studentId) return;
  const isInstructor = await authz.isAuthorizedInstructorFor(requestingUserId, studentId);
  if (!isInstructor) throw new UnauthorizedError();
}
