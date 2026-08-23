import { RequestHandler } from 'express';
import { Errors } from '../../src/lib/errors';

/** Blocks the request unless the authenticated user holds every listed permission key. */
export function requirePermission(...keys: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.authUser) return next(Errors.unauthorized());
    const missing = keys.filter(k => !req.authUser!.permissions.includes(k));
    if (missing.length > 0) {
      return next(Errors.forbidden(`Missing permission: ${missing.join(', ')}`));
    }
    next();
  };
}

/**
 * Rank-based "who can act on whom" check, independent of the permission
 * registry above. SUPER_ADMIN is exempt (can act on any user in its own
 * institution); every other role may only act on strictly lower-ranked
 * users, and may only ever assign a role ranked strictly below its own.
 */
export function canActOnRank(actorRole: string, actorRank: number, targetRank: number): boolean {
  if (actorRole === 'SUPER_ADMIN') return true;
  return actorRank > targetRank;
}

export function canAssignRank(actorRole: string, actorRank: number, newRoleRank: number): boolean {
  if (actorRole === 'SUPER_ADMIN') return true;
  return actorRank > newRoleRank;
}
