import { AuthContext, Role } from '../../types';

/**
 * The single choke point for "can this authenticated caller see data for
 * this organization?" Every route that accepts an organizationId
 * (typically only PLATFORM_ADMIN / ENGINEERING_OPERATOR cross-org
 * dashboard views) must call this rather than trusting a client-supplied
 * org id directly — for everyone else, the organization comes from the
 * verified token, never from the request body/query.
 */
export function assertOrgAccess(auth: AuthContext, requestedOrgId: string | undefined): string {
  if (!requestedOrgId || requestedOrgId === auth.organizationId) return auth.organizationId;

  const canCrossOrg = auth.role === Role.PLATFORM_ADMIN || auth.role === Role.ENGINEERING_OPERATOR;
  if (!canCrossOrg) {
    const err = new Error('Cross-organization access is not permitted for this role');
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
  return requestedOrgId;
}
