import { AuthorizationError } from '../errors.js';
import { QuestionVersion } from '../types/domain.js';
import { Role } from '../types/enums.js';

const PERMISSIONS: Record<Role, Set<string> | '*'> = {
  [Role.STUDENT]: new Set(['PRACTICE_APPROVED_QUESTIONS', 'REPORT_QUESTION', 'VIEW_PUBLIC_QUESTION']),
  [Role.TRAINER]: new Set([
    'PRACTICE_APPROVED_QUESTIONS',
    'REPORT_QUESTION',
    'VIEW_PUBLIC_QUESTION',
    'VIEW_QUALITY_SUMMARY',
  ]),
  [Role.CONTENT_REVIEWER]: new Set([
    'VIEW_PUBLIC_QUESTION',
    'VIEW_QUALITY_SUMMARY',
    'VIEW_ANSWER_KEY',
    'VIEW_ISSUES',
    'REVIEW_QUESTION',
    'EDIT_QUESTION',
    'VIEW_AUDIT_TRAIL',
  ]),
  [Role.ADMIN]: '*',
  [Role.SYSTEM]: '*',
};

export function hasPermission(role: Role, action: string): boolean {
  const perms = PERMISSIONS[role];
  return perms === '*' || perms.has(action);
}

export function assertPermission(role: Role, action: string): void {
  if (!hasPermission(role, action)) {
    throw new AuthorizationError(`Role ${role} is not permitted to perform "${action}".`);
  }
}

/** Section 90: "Institution A must not access Institution B private question sets. Global
 *  content should be explicitly marked as global." */
export function assertTenantAccess(
  requesterTenantId: string | undefined,
  resource: { tenantId?: string; isGlobal?: boolean },
): void {
  if (resource.isGlobal) return;
  if (!resource.tenantId) return; // resource has no tenant scope assigned — nothing to isolate against
  if (!requesterTenantId || requesterTenantId !== resource.tenantId) {
    throw new AuthorizationError('Cross-tenant access denied.');
  }
}

/** Section 89/103/130: students never see the answer key, the solution, or internal validation
 *  evidence through this API — regardless of what a caller asks for. */
export function filterQuestionVersionForRole(version: QuestionVersion, role: Role): Partial<QuestionVersion> {
  if (role === Role.STUDENT || role === Role.TRAINER) {
    const { answerKey: _answerKey, solution: _solution, ...safe } = version;
    return safe;
  }
  return version;
}
