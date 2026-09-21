import type { CatalogRepo } from '../repositories/catalogRepo.js';
import type { RoleDetail, RoleSummary } from '../domain/types.js';
import { searchRoles, type SearchableRole } from '../domain/search.js';
import { compareRoles, type RoleComparison } from '../domain/compare.js';
import { RoleNotFoundError } from '../api/errors.js';

export class RoleService {
  constructor(private catalog: CatalogRepo) {}

  listActiveRoles(): RoleSummary[] {
    return this.catalog.listRoleSummaries(true);
  }

  /**
   * getRoleRequirements(roleId) — the contract future diagnostic, challenge,
   * and mastery modules are meant to call (Step 38-40). Deprecated roles
   * still resolve here so historical records stay interpretable; only the
   * *listing* and *new selection* paths gate on ACTIVE status.
   */
  getRoleRequirements(slug: string): RoleDetail {
    const detail = this.catalog.getRoleDetail(slug);
    if (!detail) throw new RoleNotFoundError(slug);
    return detail;
  }

  getRoleRequirementsAtVersion(slug: string, version: number): RoleDetail {
    const detail = this.catalog.getRoleDetailAtVersion(slug, version);
    if (!detail) throw new RoleNotFoundError(`${slug}@v${version}`);
    return detail;
  }

  search(query: string): RoleSummary[] {
    const roles = this.listActiveRoles();
    const searchable: SearchableRole[] = roles.map((r) => {
      const detail = this.getRoleRequirements(r.slug);
      return {
        slug: r.slug,
        name: r.name,
        shortDescription: detail.shortDescription,
        longDescription: detail.longDescription,
        familyName: r.family.name,
        competencyNames: detail.competencies.map((c) => c.competency.name),
        technologyNames: detail.technologies.map((t) => t.technology.name),
      };
    });
    const ranked = searchRoles(searchable, query);
    const bySlug = new Map(roles.map((r) => [r.slug, r]));
    return ranked.map((r) => bySlug.get(r.slug)).filter((r): r is RoleSummary => Boolean(r));
  }

  compare(slugA: string, slugB: string): RoleComparison {
    return compareRoles(this.getRoleRequirements(slugA), this.getRoleRequirements(slugB));
  }

  getRoleVariants(institutionId: string) {
    return this.catalog.listRoleVariantsForInstitution(institutionId);
  }
}
