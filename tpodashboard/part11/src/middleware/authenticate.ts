import { RequestHandler } from 'express';
import { hashToken } from '../lib/crypto';
import { Errors } from '../lib/errors';
import * as sessionRepo from '../../db/repositories/sessionRepo';
import * as userRepo from '../../db/repositories/userRepo';
import * as roleRepo from '../../db/repositories/roleRepo';
import { listPermissionKeysForRole } from '../../db/repositories/permissionRepo';

/**
 * Loads the caller's identity fresh from the database on every request —
 * role, permissions, department, and status are never cached in the token
 * itself. This is what makes a role change or deactivation take effect on
 * the very next request, not whenever a JWT happens to expire.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw Errors.unauthorized();
    const token = header.slice(7);
    const tokenHash = hashToken(token);

    const session = sessionRepo.findSessionByTokenHash(tokenHash);
    if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) {
      throw Errors.unauthorized('Session is invalid or has expired.');
    }

    const user = userRepo.findUserById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized('Account is not active.');
    }

    const role = roleRepo.findRoleById(user.roleId)!;
    const permissions = listPermissionKeysForRole(role.id);

    sessionRepo.touchSessionLastActive(session.id);

    req.authUser = {
      id: user.id, institutionId: user.institutionId, departmentId: user.departmentId,
      email: user.email, name: user.name, role: role.name, rank: role.rank, permissions,
    };
    req.sessionId = session.id;
    next();
  } catch (err) {
    next(err);
  }
};
