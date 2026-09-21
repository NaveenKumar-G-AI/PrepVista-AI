import { NotFoundError } from '../utils/errors';

export interface TenantScoped {
  organizationId: string;
}

/**
 * Defense in depth: repository queries are already scoped by
 * organizationId, but every service call re-asserts the relationship
 * explicitly so a future refactor can't silently drop a WHERE clause
 * and leak cross-tenant data. Returns 404 rather than 403 on mismatch
 * so a cross-tenant request can't even confirm the resource exists
 * (golden scenario #72).
 */
export function assertBelongsToOrganization<T extends TenantScoped>(
  entity: T | null,
  organizationId: string,
  entityName = 'Resource'
): T {
  if (!entity || entity.organizationId !== organizationId) {
    throw new NotFoundError(`${entityName} not found.`);
  }
  return entity;
}

// ── Comparison guardrails (section 39) ───────────────────────────────

export interface ComparisonCandidate {
  cohortId: string;
  roleModelVersion: string;
  assessmentSchemaVersion: string;
  coveragePct: number;
  cohortSize: number;
}

export interface ComparisonGuardOptions {
  minCoveragePct: number;
  minCohortSize: number;
}

export const DEFAULT_COMPARISON_GUARD: ComparisonGuardOptions = {
  minCoveragePct: 0.3,
  minCohortSize: 10,
};

export type ComparisonGuardResult = { allowed: true } | { allowed: false; reasons: string[] };

/** Do not compare cohorts when role models differ, assessment versions
 * differ, evidence coverage is insufficient, or either cohort is too
 * small — comparisons that ignore these produce misleading
 * conclusions (section 39). */
export function assertComparable(
  a: ComparisonCandidate,
  b: ComparisonCandidate,
  options: ComparisonGuardOptions = DEFAULT_COMPARISON_GUARD
): ComparisonGuardResult {
  const reasons: string[] = [];

  if (a.roleModelVersion !== b.roleModelVersion) {
    reasons.push('Role models differ significantly between cohorts.');
  }
  if (a.assessmentSchemaVersion !== b.assessmentSchemaVersion) {
    reasons.push('Assessment versions differ materially between cohorts.');
  }
  if (a.coveragePct < options.minCoveragePct || b.coveragePct < options.minCoveragePct) {
    reasons.push('Evidence coverage is insufficient in one or both cohorts.');
  }
  if (a.cohortSize < options.minCohortSize || b.cohortSize < options.minCohortSize) {
    reasons.push('One or both cohorts are too small to compare safely.');
  }

  return reasons.length > 0 ? { allowed: false, reasons } : { allowed: true };
}
