import type Database from 'better-sqlite3';
import type {
  Competency,
  ContentStatus,
  RoleCompetencyLink,
  RoleDetail,
  RoleSkillLink,
  RoleSummary,
  RoleTechnologyLink,
  Skill,
  Technology,
} from '../domain/types.js';
import type { PrerequisiteEdge } from '../domain/cycles.js';

interface RoleRowJoined {
  role_id: string;
  slug: string;
  role_status: ContentStatus;
  current_version: number;
  family_slug: string;
  family_name: string;
  domain_slug: string;
  domain_name: string;
  version_id: string;
  version: number;
  name: string;
  short_description: string;
  long_description: string;
  version_status: ContentStatus;
}

const ROLE_JOIN_SQL = `
  select
    r.id as role_id, r.slug as slug, r.status as role_status, r.current_version,
    f.slug as family_slug, f.name as family_name,
    d.slug as domain_slug, d.name as domain_name,
    rv.id as version_id, rv.version, rv.name, rv.short_description, rv.long_description, rv.status as version_status
  from role r
  join role_family f on f.id = r.role_family_id
  join career_domain d on d.id = f.career_domain_id
  join role_version rv on rv.role_id = r.id and rv.version = ?
`;

export class CatalogRepo {
  constructor(private db: Database.Database) {}

  private roleBySlugAtVersion(slug: string, version: number): RoleRowJoined | undefined {
    return this.db
      .prepare(`${ROLE_JOIN_SQL} where r.slug = ?`)
      .get(version, slug) as RoleRowJoined | undefined;
  }

  private assembleDetail(row: RoleRowJoined): RoleDetail {
    const competencies = this.db
      .prepare(
        `select rc.importance, rc.expected_proficiency, rc.required,
                c.id, c.slug, c.name, c.description, c.parent_competency_id, c.status
         from role_competency rc join competency c on c.id = rc.competency_id
         where rc.role_version_id = ?`,
      )
      .all(row.version_id) as Array<{
      importance: RoleCompetencyLink['importance'];
      expected_proficiency: RoleCompetencyLink['expectedProficiency'];
      required: number;
      id: string;
      slug: string;
      name: string;
      description: string;
      parent_competency_id: string | null;
      status: ContentStatus;
    }>;

    const skills = this.db
      .prepare(
        `select rs.importance, rs.expected_proficiency, rs.required, rs.prerequisite_level,
                s.id, s.slug, s.name, s.description, s.category, s.competency_id, s.parent_skill_id, s.status
         from role_skill rs join skill s on s.id = rs.skill_id
         where rs.role_version_id = ?`,
      )
      .all(row.version_id) as Array<{
      importance: RoleSkillLink['importance'];
      expected_proficiency: RoleSkillLink['expectedProficiency'];
      required: number;
      prerequisite_level: RoleSkillLink['prerequisiteLevel'];
      id: string;
      slug: string;
      name: string;
      description: string;
      category: string | null;
      competency_id: string | null;
      parent_skill_id: string | null;
      status: ContentStatus;
    }>;

    const technologies = this.db
      .prepare(
        `select rt.usage_type,
                t.id, t.slug, t.name, t.type, t.description, t.status
         from role_technology rt join technology t on t.id = rt.technology_id
         where rt.role_version_id = ?`,
      )
      .all(row.version_id) as Array<{
      usage_type: RoleTechnologyLink['usageType'];
      id: string;
      slug: string;
      name: string;
      type: Technology['type'];
      description: string;
      status: ContentStatus;
    }>;

    return {
      id: row.role_id,
      slug: row.slug,
      name: row.name,
      shortDescription: row.short_description,
      longDescription: row.long_description,
      status: row.role_status,
      version: row.version,
      family: { slug: row.family_slug, name: row.family_name },
      domain: { slug: row.domain_slug, name: row.domain_name },
      competencies: competencies.map((c) => ({
        importance: c.importance,
        expectedProficiency: c.expected_proficiency,
        required: Boolean(c.required),
        competency: {
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          parentCompetencyId: c.parent_competency_id,
          status: c.status,
        },
      })),
      skills: skills.map((s) => ({
        importance: s.importance,
        expectedProficiency: s.expected_proficiency,
        required: Boolean(s.required),
        prerequisiteLevel: s.prerequisite_level,
        skill: {
          id: s.id,
          slug: s.slug,
          name: s.name,
          description: s.description,
          category: s.category,
          competencyId: s.competency_id,
          parentSkillId: s.parent_skill_id,
          status: s.status,
        },
      })),
      technologies: technologies.map((t) => ({
        usageType: t.usage_type,
        technology: {
          id: t.id,
          slug: t.slug,
          name: t.name,
          type: t.type,
          description: t.description,
          status: t.status,
        },
      })),
    };
  }

  /** Resolves a role at its *current* version — the normal read path. */
  getRoleDetail(slug: string): RoleDetail | null {
    const roleRow = this.db.prepare('select current_version from role where slug = ?').get(slug) as
      | { current_version: number }
      | undefined;
    if (!roleRow) return null;
    const row = this.roleBySlugAtVersion(slug, roleRow.current_version);
    if (!row) return null;
    return this.assembleDetail(row);
  }

  /**
   * Resolves a role at a SPECIFIC historical version, ignoring whatever the
   * current version is. This is what preserves historical interpretation
   * (Step 6 / Step 48) — a student's history row always resolves through
   * here, never through getRoleDetail().
   */
  getRoleDetailAtVersion(slug: string, version: number): RoleDetail | null {
    const row = this.roleBySlugAtVersion(slug, version);
    if (!row) return null;
    return this.assembleDetail(row);
  }

  getRoleStatusAndVersion(slug: string): { id: string; status: ContentStatus; currentVersion: number } | null {
    const row = this.db
      .prepare('select id, status, current_version from role where slug = ?')
      .get(slug) as { id: string; status: ContentStatus; current_version: number } | undefined;
    if (!row) return null;
    return { id: row.id, status: row.status, currentVersion: row.current_version };
  }

  listRoleSummaries(onlyActive = true): RoleSummary[] {
    const roleRows = this.db
      .prepare(
        `select r.slug, r.status, r.current_version
         from role r
         ${onlyActive ? "where r.status = 'ACTIVE'" : ''}
         order by r.slug`,
      )
      .all() as Array<{ slug: string; status: ContentStatus; current_version: number }>;

    return roleRows.map((r) => {
      const detail = this.getRoleDetail(r.slug) as RoleDetail;
      const topAreas = detail.competencies
        .filter((c) => c.importance === 'CORE')
        .slice(0, 5)
        .map((c) => c.competency.name);
      return {
        id: detail.id,
        slug: detail.slug,
        name: detail.name,
        shortDescription: detail.shortDescription,
        status: detail.status,
        family: detail.family,
        domain: detail.domain,
        topAreas,
      };
    });
  }

  listAllSkillPrerequisites(): PrerequisiteEdge[] {
    const rows = this.db.prepare('select skill_id, prerequisite_skill_id from skill_prerequisite').all() as Array<{
      skill_id: string;
      prerequisite_skill_id: string;
    }>;
    return rows.map((r) => ({ skillId: r.skill_id, prerequisiteSkillId: r.prerequisite_skill_id }));
  }

  getSkillIdBySlug(slug: string): string | null {
    const row = this.db.prepare('select id from skill where slug = ?').get(slug) as { id: string } | undefined;
    return row?.id ?? null;
  }

  getRoleSlugById(id: string): string | null {
    const row = this.db.prepare('select slug from role where id = ?').get(id) as { slug: string } | undefined;
    return row?.slug ?? null;
  }

  getInstitutionBySlug(slug: string): { id: string; slug: string; name: string } | null {
    const row = this.db.prepare('select id, slug, name from institution where slug = ?').get(slug) as
      | { id: string; slug: string; name: string }
      | undefined;
    return row ?? null;
  }

  getInstitutionById(id: string): { id: string; slug: string; name: string } | null {
    const row = this.db.prepare('select id, slug, name from institution where id = ?').get(id) as
      | { id: string; slug: string; name: string }
      | undefined;
    return row ?? null;
  }

  listRoleVariantsForInstitution(institutionId: string): Array<{ slug: string; name: string; description: string | null; status: ContentStatus }> {
    const rows = this.db
      .prepare(
        `select rv.name, rv.description, rv.status, r.slug as base_role_slug
         from role_variant rv
         join role r on r.id = rv.base_role_id
         where rv.institution_id = ?`,
      )
      .all(institutionId) as Array<{ name: string; description: string | null; status: ContentStatus; base_role_slug: string }>;
    return rows.map((r) => ({ slug: r.base_role_slug, name: r.name, description: r.description, status: r.status }));
  }
}
