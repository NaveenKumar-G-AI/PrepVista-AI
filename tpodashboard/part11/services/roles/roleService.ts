import * as roleRepo from '../../db/repositories/roleRepo';
import { findPermissionsByKeys, grantPermissionToRole, listPermissionKeysForRole } from '../../db/repositories/permissionRepo';
import { recordAudit } from '../audit/auditService';
import { Errors } from '../../src/lib/errors';
import { AuthUser } from '../../src/types/authUser';

export function listRoles(institutionId: string) {
  return roleRepo.listRolesByInstitution(institutionId).map(role => ({
    ...role,
    permissions: listPermissionKeysForRole(role.id),
    userCount: roleRepo.countUsersForRole(role.id),
  }));
}

export function createCustomRole(authUser: AuthUser, input: { name: string; rank: number; permissionKeys: string[] }) {
  if (input.rank >= authUser.rank && authUser.role !== 'SUPER_ADMIN') {
    throw Errors.forbidden('A custom role cannot outrank its creator.');
  }
  // You cannot grant a permission you do not personally hold — otherwise a
  // custom role becomes a privilege-escalation side door.
  const notHeld = input.permissionKeys.filter(k => !authUser.permissions.includes(k));
  if (notHeld.length > 0) {
    throw Errors.forbidden(`You cannot grant permissions you do not hold: ${notHeld.join(', ')}`);
  }

  const role = roleRepo.createRole({ institutionId: authUser.institutionId, name: input.name, rank: input.rank, isSystem: false });
  const permissions = findPermissionsByKeys(input.permissionKeys);
  for (const p of permissions) grantPermissionToRole(role.id, p.id);

  recordAudit({
    institutionId: authUser.institutionId, actorId: authUser.id, action: 'role.custom_role_created',
    entityType: 'Role', entityId: role.id, newState: { name: role.name, rank: role.rank, permissions: input.permissionKeys },
  });

  return { ...role, permissions: listPermissionKeysForRole(role.id) };
}
