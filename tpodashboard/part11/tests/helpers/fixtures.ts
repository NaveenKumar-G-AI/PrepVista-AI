import crypto from 'node:crypto';
import { bootstrapInstitution } from '../../services/bootstrap/bootstrapInstitution';
import { createDepartment } from '../../db/repositories/departmentRepo';
import { createUser } from '../../db/repositories/userRepo';
import { hashPassword } from '../../src/lib/crypto';

export const FIXTURE_PASSWORD = 'TestPass!2026';

/**
 * Two fully separate institutions, each with their own roles/permissions
 * (bootstrapInstitution runs per institution) and a spread of users — enough
 * to exercise tenant isolation, department scope, and rank checks against
 * real, persisted data rather than mocks.
 *
 * All test files share a single SQLite file for the run (see package.json's
 * "test" script), so every call gets a random suffix to keep emails/institution
 * names globally unique — tests reference fx.users.*.email rather than
 * hardcoding addresses, so this is invisible to the test bodies themselves.
 */
export async function seedTwoInstitutions() {
  const nonce = crypto.randomBytes(4).toString('hex');

  const alpha = await bootstrapInstitution({
    institutionName: `Alpha College ${nonce}`, superAdminEmail: `super@alpha-${nonce}.test`,
    superAdminName: 'Alpha Super Admin', superAdminPassword: FIXTURE_PASSWORD,
  });
  const beta = await bootstrapInstitution({
    institutionName: `Beta College ${nonce}`, superAdminEmail: `super@beta-${nonce}.test`,
    superAdminName: 'Beta Super Admin', superAdminPassword: FIXTURE_PASSWORD,
  });

  const cseAlpha = createDepartment({ institutionId: alpha.institution.id, name: 'CSE', code: 'CSE' });
  const eceAlpha = createDepartment({ institutionId: alpha.institution.id, name: 'ECE', code: 'ECE' });

  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const mk = (institutionId: string, email: string, name: string, roleId: string, departmentId: string | null = null) =>
    createUser({ institutionId, email, name, roleId, departmentId, passwordHash, status: 'ACTIVE' });

  const users = {
    tpoHeadAlpha: mk(alpha.institution.id, `tpo@alpha-${nonce}.test`, 'Alpha TPO Head', alpha.roleByName['TPO_HEAD']),
    officerAlpha: mk(alpha.institution.id, `officer@alpha-${nonce}.test`, 'Alpha Officer', alpha.roleByName['PLACEMENT_OFFICER']),
    coordCseAlpha: mk(alpha.institution.id, `coord.cse@alpha-${nonce}.test`, 'Alpha CSE Coordinator', alpha.roleByName['DEPARTMENT_COORDINATOR'], cseAlpha.id),
    coordEceAlpha: mk(alpha.institution.id, `coord.ece@alpha-${nonce}.test`, 'Alpha ECE Coordinator', alpha.roleByName['DEPARTMENT_COORDINATOR'], eceAlpha.id),
    studentAlpha: mk(alpha.institution.id, `student@alpha-${nonce}.test`, 'Alpha Student', alpha.roleByName['STUDENT'], cseAlpha.id),
    managementAlpha: mk(alpha.institution.id, `mgmt@alpha-${nonce}.test`, 'Alpha Management', alpha.roleByName['MANAGEMENT']),
    tpoHeadBeta: mk(beta.institution.id, `tpo@beta-${nonce}.test`, 'Beta TPO Head', beta.roleByName['TPO_HEAD']),
    studentBeta: mk(beta.institution.id, `student@beta-${nonce}.test`, 'Beta Student', beta.roleByName['STUDENT']),
  };

  return { alpha, beta, cseAlpha, eceAlpha, users, password: FIXTURE_PASSWORD, superAdminAlphaEmail: `super@alpha-${nonce}.test`, superAdminBetaEmail: `super@beta-${nonce}.test` };
}
