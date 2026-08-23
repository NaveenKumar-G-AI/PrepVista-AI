import { createInstitution } from '../../db/repositories/institutionRepo';
import { createRole } from '../../db/repositories/roleRepo';
import { findPermissionsByKeys, grantPermissionToRole } from '../../db/repositories/permissionRepo';
import { createUser } from '../../db/repositories/userRepo';
import { ensurePermissionRegistry } from '../authorization/permissions';
import { ROLE_DEFAULTS } from '../authorization/roleDefaults';
import { hashPassword } from '../../src/lib/crypto';

interface BootstrapInput {
  institutionName: string;
  timezone?: string;
  superAdminEmail: string;
  superAdminName: string;
  superAdminPassword: string;
}

/**
 * Creates a new institution with least-privilege default roles already
 * wired to the global permission registry, plus its first Super Admin.
 * This is the "safe defaults for new institutions" control (spec section 49):
 * nothing is open by default, and every role starts from the matrix in
 * services/authorization/roleDefaults.ts, not an ad-hoc grant.
 */
export async function bootstrapInstitution(input: BootstrapInput) {
  ensurePermissionRegistry();

  const institution = createInstitution({ name: input.institutionName, timezone: input.timezone });

  const roleByName: Record<string, string> = {};
  for (const def of ROLE_DEFAULTS) {
    const role = createRole({ institutionId: institution.id, name: def.name, rank: def.rank, isSystem: true });
    const permissions = findPermissionsByKeys(def.permissions);
    for (const p of permissions) grantPermissionToRole(role.id, p.id);
    roleByName[def.name] = role.id;
  }

  const passwordHash = await hashPassword(input.superAdminPassword);
  const superAdmin = createUser({
    institutionId: institution.id, email: input.superAdminEmail, name: input.superAdminName,
    roleId: roleByName['SUPER_ADMIN'], passwordHash, status: 'ACTIVE',
  });

  return { institution, roleByName, superAdmin };
}
