import { repositories } from '../repositories';
import { assertBelongsToOrganization } from '../core/guards';
import { applyPrivacyThreshold, DEFAULT_PRIVACY_POLICY, type PrivacyGuardResult } from '../core/coverage';
import { ValidationError } from '../utils/errors';
import type { CohortKind, CohortDimension } from '../domain/enums';
import type { Cohort, Membership } from '../domain/types';

export interface CreateCohortRequest {
  organizationId: string;
  name: string;
  kind: CohortKind;
  dimension: CohortDimension;
  parentCohortId?: string | null;
  attributes?: Record<string, unknown>;
}

export const cohortService = {
  async create(req: CreateCohortRequest): Promise<Cohort> {
    if (!req.name.trim()) throw new ValidationError('Cohort name is required.');
    if (req.parentCohortId) {
      const parent = await repositories.cohorts.findById(req.organizationId, req.parentCohortId);
      assertBelongsToOrganization(parent, req.organizationId, 'Parent cohort');
    }
    return repositories.cohorts.create(req);
  },

  /** Fetches a cohort scoped to organizationId AND re-asserts the
   * tenant relationship explicitly (section 52, 72) — the single
   * choke point every other read/write in this service routes through. */
  async get(organizationId: string, cohortId: string): Promise<Cohort> {
    const cohort = await repositories.cohorts.findById(organizationId, cohortId);
    return assertBelongsToOrganization(cohort, organizationId, 'Cohort');
  },

  async list(organizationId: string, kind?: CohortKind): Promise<Cohort[]> {
    return repositories.cohorts.list(organizationId, kind ? { kind, isActive: true } : { isActive: true });
  },

  async addMember(organizationId: string, cohortId: string, studentId: string): Promise<Membership> {
    await this.get(organizationId, cohortId); // asserts existence + tenant match
    return repositories.memberships.add(organizationId, cohortId, studentId);
  },

  async removeMember(organizationId: string, cohortId: string, studentId: string): Promise<void> {
    await this.get(organizationId, cohortId);
    return repositories.memberships.remove(organizationId, cohortId, studentId);
  },

  async listMembers(organizationId: string, cohortId: string): Promise<string[]> {
    await this.get(organizationId, cohortId);
    return repositories.memberships.listStudentIds(organizationId, cohortId);
  },

  /** Section 31/71 — is this cohort large enough to show aggregate
   * stats at all? */
  async checkPrivacyGuard(organizationId: string, cohortId: string): Promise<PrivacyGuardResult> {
    const size = await repositories.memberships.count(organizationId, cohortId);
    const policy = await repositories.privacyPolicy.get(organizationId);
    return applyPrivacyThreshold(size, { minCohortSize: policy.minCohortSize ?? DEFAULT_PRIVACY_POLICY.minCohortSize });
  },
};
