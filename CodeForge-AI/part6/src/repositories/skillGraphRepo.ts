import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Role, RoleCompetency, Skill, SkillPrerequisite } from '../domain/types';

export function upsertSkill(db: Database.Database, id: string, name: string, category: string, description?: string) {
  db.prepare(
    `INSERT INTO skills (id, name, category, description) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, description=excluded.description`
  ).run(id, name, category, description ?? null);
}

export function addPrerequisite(db: Database.Database, skillId: string, prerequisiteSkillId: string, relationshipType: SkillPrerequisite['relationshipType'] = 'PREREQUISITE') {
  db.prepare(
    `INSERT OR IGNORE INTO skill_prerequisites (skill_id, prerequisite_skill_id, relationship_type) VALUES (?, ?, ?)`
  ).run(skillId, prerequisiteSkillId, relationshipType);
}

export function upsertRole(db: Database.Database, id: string, name: string, description?: string) {
  db.prepare(
    `INSERT INTO roles (id, name, description) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description`
  ).run(id, name, description ?? null);
}

export function addRoleCompetency(
  db: Database.Database,
  input: Omit<RoleCompetency, 'id'>
): void {
  db.prepare(
    `INSERT INTO role_competencies (id, role_id, skill_id, priority, target_mastery, required, weight, sequence_hint, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(role_id, skill_id) DO UPDATE SET priority=excluded.priority, target_mastery=excluded.target_mastery,
       required=excluded.required, weight=excluded.weight, sequence_hint=excluded.sequence_hint, description=excluded.description`
  ).run(
    randomUUID(),
    input.roleId,
    input.skillId,
    input.priority,
    input.targetMastery,
    input.required ? 1 : 0,
    input.weight,
    input.sequenceHint,
    input.description
  );
}

export function getAllSkills(db: Database.Database): Skill[] {
  return db.prepare(`SELECT id, name, category, description FROM skills`).all() as Skill[];
}

export function getAllPrerequisites(db: Database.Database): SkillPrerequisite[] {
  const rows = db.prepare(`SELECT skill_id, prerequisite_skill_id, relationship_type FROM skill_prerequisites`).all() as Array<{
    skill_id: string;
    prerequisite_skill_id: string;
    relationship_type: SkillPrerequisite['relationshipType'];
  }>;
  return rows.map((r) => ({ skillId: r.skill_id, prerequisiteSkillId: r.prerequisite_skill_id, relationshipType: r.relationship_type }));
}

export function getRoleByName(db: Database.Database, name: string): Role | undefined {
  return db.prepare(`SELECT id, name, description FROM roles WHERE name = ?`).get(name) as Role | undefined;
}

export function getRoleById(db: Database.Database, id: string): Role | undefined {
  return db.prepare(`SELECT id, name, description FROM roles WHERE id = ?`).get(id) as Role | undefined;
}

export function getRoleCompetencies(db: Database.Database, roleId: string): RoleCompetency[] {
  const rows = db
    .prepare(
      `SELECT id, role_id, skill_id, priority, target_mastery, required, weight, sequence_hint, description
       FROM role_competencies WHERE role_id = ?`
    )
    .all(roleId) as Array<{
    id: string;
    role_id: string;
    skill_id: string;
    priority: RoleCompetency['priority'];
    target_mastery: RoleCompetency['targetMastery'];
    required: number;
    weight: number;
    sequence_hint: number | null;
    description: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    roleId: r.role_id,
    skillId: r.skill_id,
    priority: r.priority,
    targetMastery: r.target_mastery,
    required: r.required === 1,
    weight: r.weight,
    sequenceHint: r.sequence_hint,
    description: r.description,
  }));
}

export function skillCategoryMap(skills: Skill[]): Map<string, string> {
  return new Map(skills.map((s) => [s.id, s.category]));
}
