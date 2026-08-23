import { generateToken, hashToken, hashPassword } from '../../src/lib/crypto';
import * as userRepo from '../../db/repositories/userRepo';
import * as roleRepo from '../../db/repositories/roleRepo';
import * as securityTokenRepo from '../../db/repositories/securityTokenRepo';
import { recordAudit } from '../audit/auditService';
import { revokeAllForUser } from '../sessions/sessionService';
import { Errors } from '../../src/lib/errors';
import { canActOnRank, canAssignRank } from '../authorization/rbac';
import { AuthUser } from '../../src/types/authUser';
import { withTransaction } from '../../src/lib/db';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function listUsers(authUser: AuthUser) {
  // Department Coordinators only ever see their own department's users. This
  // is enforced here, in the query itself — not by filtering results after
  // the fact, and not by anything the client sends.
  const departmentId = authUser.role === 'DEPARTMENT_COORDINATOR' ? authUser.departmentId : undefined;
  return userRepo.listUsersByInstitution(authUser.institutionId, departmentId ?? undefined);
}

export function inviteUser(authUser: AuthUser, input: { email: string; name: string; roleName: string; departmentId?: string }) {
  const role = roleRepo.findRoleByName(authUser.institutionId, input.roleName);
  if (!role) throw Errors.badRequest(`Unknown role: ${input.roleName}`);
  if (!canAssignRank(authUser.role, authUser.rank, role.rank)) {
    throw Errors.forbidden('You cannot assign a role equal to or higher than your own.');
  }

  const existing = userRepo.findUserByEmail(input.email);
  if (existing) throw Errors.conflict('A user with this email already exists.');

  const user = userRepo.createUser({
    institutionId: authUser.institutionId, email: input.email, name: input.name,
    roleId: role.id, departmentId: input.departmentId, status: 'INVITED',
  });

  const token = generateToken();
  securityTokenRepo.createSecurityToken({
    institutionId: authUser.institutionId, userId: user.id, purpose: 'INVITE',
    tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  });

  recordAudit({
    institutionId: authUser.institutionId, actorId: authUser.id, action: 'user.invited',
    entityType: 'User', entityId: user.id, newState: { email: user.email, role: role.name },
  });

  return { user, devToken: token };
}

export async function acceptInvitation(token: string, password: string) {
  const record = securityTokenRepo.findSecurityTokenByHash(hashToken(token));
  if (!record || record.purpose !== 'INVITE' || record.usedAt || new Date(record.expiresAt) < new Date()) {
    throw Errors.badRequest('This invitation is invalid or has expired.');
  }
  const passwordHash = await hashPassword(password);

  withTransaction(() => {
    userRepo.updateUser(record.userId, { passwordHash, status: 'ACTIVE' });
    securityTokenRepo.markSecurityTokenUsed(record.id);
  });

  recordAudit({
    institutionId: record.institutionId, actorId: record.userId, action: 'user.invitation_accepted',
    entityType: 'User', entityId: record.userId,
  });
}

export function changeUserRole(authUser: AuthUser, targetUserId: string, newRoleName: string) {
  if (targetUserId === authUser.id) {
    throw Errors.forbidden('You cannot change your own role. Ask another administrator to do it.');
  }

  const target = userRepo.findUserById(targetUserId);
  if (!target || target.institutionId !== authUser.institutionId) throw Errors.notFound('User not found.');
  const targetRole = roleRepo.findRoleById(target.roleId)!;

  const newRole = roleRepo.findRoleByName(authUser.institutionId, newRoleName);
  if (!newRole) throw Errors.badRequest(`Unknown role: ${newRoleName}`);

  if (!canActOnRank(authUser.role, authUser.rank, targetRole.rank)) {
    throw Errors.forbidden('You cannot modify a user with equal or higher privilege.');
  }
  if (!canAssignRank(authUser.role, authUser.rank, newRole.rank)) {
    throw Errors.forbidden('You cannot assign a role equal to or higher than your own.');
  }
  if (targetRole.name === 'SUPER_ADMIN' && newRole.name !== 'SUPER_ADMIN') {
    assertNotLastActiveInRole(authUser.institutionId, 'SUPER_ADMIN', target.id);
  }

  const updated = userRepo.updateUser(target.id, { roleId: newRole.id });
  // Force re-authentication everywhere so the new (or reduced) permission
  // set takes effect immediately rather than lingering on old sessions.
  revokeAllForUser(target.id);

  recordAudit({
    institutionId: authUser.institutionId, actorId: authUser.id, action: 'user.role_changed',
    entityType: 'User', entityId: target.id,
    oldState: { role: targetRole.name }, newState: { role: newRole.name },
  });

  return updated;
}

export function changeUserStatus(authUser: AuthUser, targetUserId: string, status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED') {
  if (targetUserId === authUser.id) {
    throw Errors.forbidden('You cannot change your own account status. Ask another administrator to do it.');
  }

  const target = userRepo.findUserById(targetUserId);
  if (!target || target.institutionId !== authUser.institutionId) throw Errors.notFound('User not found.');
  const targetRole = roleRepo.findRoleById(target.roleId)!;

  if (!canActOnRank(authUser.role, authUser.rank, targetRole.rank)) {
    throw Errors.forbidden('You cannot modify a user with equal or higher privilege.');
  }
  if (targetRole.name === 'SUPER_ADMIN' && status !== 'ACTIVE') {
    assertNotLastActiveInRole(authUser.institutionId, 'SUPER_ADMIN', target.id);
  }

  const updated = userRepo.updateUser(target.id, { status });
  if (status !== 'ACTIVE') revokeAllForUser(target.id);

  recordAudit({
    institutionId: authUser.institutionId, actorId: authUser.id, action: 'user.status_changed',
    entityType: 'User', entityId: target.id,
    oldState: { status: target.status }, newState: { status },
  });

  return updated;
}

/**
 * Defense-in-depth: even if this were ever reachable (today it is not, in
 * combination with the self-action block above — see docs/ARCHITECTURE.md
 * for why that's a deliberate, documented finding rather than an oversight),
 * an institution may never be left with zero active Super Admins.
 */
function assertNotLastActiveInRole(institutionId: string, roleName: string, excludingUserId: string) {
  const remaining = userRepo.countOtherActiveUsersByRoleName(institutionId, roleName, excludingUserId);
  if (remaining === 0) {
    throw Errors.conflict(`This institution must always have at least one active ${roleName.replace('_', ' ')}.`);
  }
}
