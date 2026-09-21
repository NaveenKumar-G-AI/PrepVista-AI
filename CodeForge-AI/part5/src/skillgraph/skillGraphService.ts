import type { DB } from '../db/client.js';
import type { RelationshipType, Skill, SkillRelationship } from '../types.js';

interface SkillRow { id: string; name: string; parent_skill_id: string | null; description: string | null; }
interface RelRow { id: string; from_skill_id: string; to_skill_id: string; relationship_type: string; weight: number; }

function toSkill(r: SkillRow): Skill {
  return { id: r.id, name: r.name, parentSkillId: r.parent_skill_id, description: r.description };
}
function toRel(r: RelRow): SkillRelationship {
  return { id: r.id, fromSkillId: r.from_skill_id, toSkillId: r.to_skill_id, relationshipType: r.relationship_type as RelationshipType, weight: r.weight };
}

export class SkillGraphService {
  constructor(private db: DB) {}

  getSkill(skillId: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as unknown as SkillRow | undefined;
    return row ? toSkill(row) : null;
  }

  getAllSkills(): Skill[] {
    const rows = this.db.prepare('SELECT * FROM skills').all() as unknown as SkillRow[];
    return rows.map(toSkill);
  }

  /** Direct children in the SUBSKILL_OF hierarchy (parent_skill_id tree). */
  getChildren(skillId: string): Skill[] {
    const rows = this.db.prepare('SELECT * FROM skills WHERE parent_skill_id = ?').all(skillId) as unknown as SkillRow[];
    return rows.map(toSkill);
  }

  getParent(skillId: string): Skill | null {
    const skill = this.getSkill(skillId);
    if (!skill?.parentSkillId) return null;
    return this.getSkill(skill.parentSkillId);
  }

  /** Direct prerequisites of a skill (skills that must precede it), as declared data, not code. */
  getDirectPrerequisites(skillId: string): { skill: Skill; weight: number }[] {
    const rows = this.db
      .prepare("SELECT * FROM skill_relationships WHERE to_skill_id = ? AND relationship_type = 'PREREQUISITE'")
      .all(skillId) as unknown as RelRow[];
    return rows
      .map((r) => ({ skill: this.getSkill(r.from_skill_id), weight: r.weight }))
      .filter((x): x is { skill: Skill; weight: number } => x.skill !== null);
  }

  /** All transitive prerequisites, cycle-safe (visited-set), nearest first. */
  getAllPrerequisites(skillId: string, _visited: Set<string> = new Set()): Skill[] {
    if (_visited.has(skillId)) return [];
    _visited.add(skillId);
    const direct = this.getDirectPrerequisites(skillId);
    const out: Skill[] = [];
    for (const { skill } of direct) {
      if (!_visited.has(skill.id)) {
        out.push(skill);
        out.push(...this.getAllPrerequisites(skill.id, _visited));
      }
    }
    return out;
  }

  getRelated(skillId: string, type: RelationshipType): Skill[] {
    const rows = this.db
      .prepare('SELECT * FROM skill_relationships WHERE (from_skill_id = ? OR to_skill_id = ?) AND relationship_type = ?')
      .all(skillId, skillId, type) as unknown as RelRow[];
    const ids = rows.map((r) => (r.from_skill_id === skillId ? r.to_skill_id : r.from_skill_id));
    return ids.map((id) => this.getSkill(id)).filter((s): s is Skill => s !== null);
  }

  getRelationshipsFrom(skillId: string): SkillRelationship[] {
    const rows = this.db.prepare('SELECT * FROM skill_relationships WHERE from_skill_id = ?').all(skillId) as unknown as RelRow[];
    return rows.map(toRel);
  }

  /** Skills for which `skillId` is a direct prerequisite (used to propagate readiness forward). */
  getDependents(skillId: string): Skill[] {
    const rows = this.db
      .prepare("SELECT * FROM skill_relationships WHERE from_skill_id = ? AND relationship_type = 'PREREQUISITE'")
      .all(skillId) as unknown as RelRow[];
    return rows.map((r) => this.getSkill(r.to_skill_id)).filter((s): s is Skill => s !== null);
  }
}
