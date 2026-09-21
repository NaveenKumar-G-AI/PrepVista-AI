import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  domains,
  families,
  competencies,
  skills,
  technologies,
  roles,
  skillPrerequisites,
  institutions,
  students,
  roleVariants,
} from './data.js';
import { findCycles } from '../domain/cycles.js';

export interface SeedIds {
  domainIds: Map<string, string>;
  familyIds: Map<string, string>;
  competencyIds: Map<string, string>;
  skillIds: Map<string, string>;
  technologyIds: Map<string, string>;
  roleIds: Map<string, string>;
  institutionIds: Map<string, string>;
}

/**
 * Loads src/seed/data.ts into `db` (must already have schema.sql applied).
 * Used by both scripts/seed.ts (file-backed dev database) and the test
 * suite (in-memory database) so the two never drift apart.
 */
export function loadSeed(db: Database.Database): SeedIds {
  const ids: SeedIds = {
    domainIds: new Map(),
    familyIds: new Map(),
    competencyIds: new Map(),
    skillIds: new Map(),
    technologyIds: new Map(),
    roleIds: new Map(),
    institutionIds: new Map(),
  };

  const run = db.transaction(() => {
    const insertDomain = db.prepare(
      'insert into career_domain (id, slug, name, description) values (@id, @slug, @name, @description)',
    );
    for (const d of domains) {
      const id = randomUUID();
      ids.domainIds.set(d.slug, id);
      insertDomain.run({ id, slug: d.slug, name: d.name, description: d.description });
    }

    const insertFamily = db.prepare(
      'insert into role_family (id, slug, name, description, career_domain_id) values (@id, @slug, @name, @description, @careerDomainId)',
    );
    for (const f of families) {
      const id = randomUUID();
      ids.familyIds.set(f.slug, id);
      insertFamily.run({ id, slug: f.slug, name: f.name, description: f.description, careerDomainId: ids.domainIds.get(f.domain) });
    }

    const insertCompetency = db.prepare(
      'insert into competency (id, slug, name, description, parent_competency_id) values (@id, @slug, @name, @description, null)',
    );
    for (const c of competencies) {
      const id = randomUUID();
      ids.competencyIds.set(c.slug, id);
      insertCompetency.run({ id, slug: c.slug, name: c.name, description: c.description });
    }

    for (const s of skills) ids.skillIds.set(s.slug, randomUUID());
    const insertSkill = db.prepare(
      `insert into skill (id, slug, name, description, category, competency_id, parent_skill_id)
       values (@id, @slug, @name, @description, @category, @competencyId, @parentId)`,
    );
    for (const s of skills) {
      insertSkill.run({
        id: ids.skillIds.get(s.slug),
        slug: s.slug,
        name: s.name,
        description: s.description,
        category: s.category,
        competencyId: ids.competencyIds.get(s.competency) ?? null,
        parentId: s.parent ? ids.skillIds.get(s.parent) : null,
      });
    }

    const insertTechnology = db.prepare(
      'insert into technology (id, slug, name, type, description) values (@id, @slug, @name, @type, @description)',
    );
    for (const t of technologies) {
      const id = randomUUID();
      ids.technologyIds.set(t.slug, id);
      insertTechnology.run({ id, slug: t.slug, name: t.name, type: t.type, description: t.description });
    }

    const insertRole = db.prepare(
      'insert into role (id, slug, role_family_id, status, current_version) values (@id, @slug, @familyId, @status, @currentVersion)',
    );
    const insertVersion = db.prepare(
      `insert into role_version (id, role_id, version, name, short_description, long_description, status)
       values (@id, @roleId, @version, @name, @shortDescription, @longDescription, @status)`,
    );
    const insertRoleCompetency = db.prepare(
      `insert into role_competency (id, role_version_id, competency_id, importance, expected_proficiency, required)
       values (@id, @roleVersionId, @competencyId, @importance, @proficiency, 1)`,
    );
    const insertRoleSkill = db.prepare(
      `insert into role_skill (id, role_version_id, skill_id, importance, expected_proficiency, required)
       values (@id, @roleVersionId, @skillId, @importance, @proficiency, 1)`,
    );
    const insertRoleTechnology = db.prepare(
      `insert into role_technology (id, role_version_id, technology_id, usage_type)
       values (@id, @roleVersionId, @technologyId, @usage)`,
    );

    for (const r of roles) {
      const roleId = randomUUID();
      ids.roleIds.set(r.slug, roleId);
      const isVersioned = Boolean(r.competenciesV1Only);
      const currentVersion = isVersioned ? 2 : 1;
      insertRole.run({ id: roleId, slug: r.slug, familyId: ids.familyIds.get(r.family), status: r.status, currentVersion });

      const versionsToCreate = isVersioned
        ? [
            { version: 1, status: 'ARCHIVED', competencies: r.competencies.filter((c) => r.competenciesV1Only!.includes(c.competency)) },
            { version: 2, status: r.status, competencies: r.competencies },
          ]
        : [{ version: 1, status: r.status, competencies: r.competencies }];

      for (const v of versionsToCreate) {
        const versionId = randomUUID();
        insertVersion.run({
          id: versionId,
          roleId,
          version: v.version,
          name: r.name,
          shortDescription: r.shortDescription,
          longDescription: r.longDescription,
          status: v.status,
        });
        for (const rc of v.competencies) {
          insertRoleCompetency.run({
            id: randomUUID(),
            roleVersionId: versionId,
            competencyId: ids.competencyIds.get(rc.competency),
            importance: rc.importance,
            proficiency: rc.proficiency,
          });
        }
        for (const rs of r.skills) {
          insertRoleSkill.run({
            id: randomUUID(),
            roleVersionId: versionId,
            skillId: ids.skillIds.get(rs.skill),
            importance: rs.importance,
            proficiency: rs.proficiency,
          });
        }
        for (const rt of r.technologies) {
          insertRoleTechnology.run({
            id: randomUUID(),
            roleVersionId: versionId,
            technologyId: ids.technologyIds.get(rt.technology),
            usage: rt.usage,
          });
        }
      }
    }

    const insertPrereq = db.prepare(
      'insert into skill_prerequisite (skill_id, prerequisite_skill_id) values (@skillId, @prerequisiteId)',
    );
    for (const p of skillPrerequisites) {
      insertPrereq.run({ skillId: ids.skillIds.get(p.skill), prerequisiteId: ids.skillIds.get(p.prerequisite) });
    }

    const insertInstitution = db.prepare('insert into institution (id, slug, name) values (@id, @slug, @name)');
    for (const i of institutions) {
      const id = randomUUID();
      ids.institutionIds.set(i.slug, id);
      insertInstitution.run({ id, slug: i.slug, name: i.name });
    }

    const insertStudent = db.prepare(
      'insert into student (id, institution_id, display_name) values (@id, @institutionId, @displayName)',
    );
    for (const s of students) {
      insertStudent.run({ id: s.id, institutionId: ids.institutionIds.get(s.institution), displayName: s.displayName });
    }

    const insertVariant = db.prepare(
      `insert into role_variant (id, base_role_id, institution_id, name, description, status)
       values (@id, @baseRoleId, @institutionId, @name, @description, @status)`,
    );
    for (const v of roleVariants) {
      insertVariant.run({
        id: randomUUID(),
        baseRoleId: ids.roleIds.get(v.baseRole),
        institutionId: ids.institutionIds.get(v.institution),
        name: v.name,
        description: v.description,
        status: v.status,
      });
    }
  });

  run();

  const edges = db.prepare('select skill_id, prerequisite_skill_id from skill_prerequisite').all() as Array<{
    skill_id: string;
    prerequisite_skill_id: string;
  }>;
  const cycleReport = findCycles(edges.map((e) => ({ skillId: e.skill_id, prerequisiteSkillId: e.prerequisite_skill_id })));
  if (cycleReport.hasCycle) {
    throw new Error(`Seed data contains a circular prerequisite graph: ${cycleReport.nodesInCycles.join(', ')}`);
  }

  return ids;
}
