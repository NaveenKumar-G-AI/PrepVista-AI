import type { PoolClient } from 'pg';
import type { PrerequisiteState, SkillNode, SkillRelationship } from '../domain/types.js';
import type { MasteryState } from '../domain/config.js';
import { getPool } from './db.js';

export class SkillGraphRepository {
  async getSkillByKey(key: string, client?: PoolClient): Promise<SkillNode | null> {
    const db = client ?? getPool();
    const { rows } = await db.query(`select id, key, name, parent_id, category from skill_nodes where key = $1`, [key]);
    if (!rows[0]) return null;
    return { id: rows[0].id, key: rows[0].key, name: rows[0].name, parentId: rows[0].parent_id, category: rows[0].category };
  }

  async listRelationships(client?: PoolClient): Promise<SkillRelationship[]> {
    const db = client ?? getPool();
    const { rows } = await db.query(`select from_skill_id, to_skill_id, relationship_type, weight from skill_relationships`);
    return rows.map((r) => ({ fromSkillId: r.from_skill_id, toSkillId: r.to_skill_id, type: r.relationship_type, weight: Number(r.weight) }));
  }

  /** Direct prerequisites/dependencies of `skillId`, joined with the student's current state for each. */
  async listPrerequisiteStates(studentId: string, skillId: string, client?: PoolClient): Promise<PrerequisiteState[]> {
    const db = client ?? getPool();
    const { rows } = await db.query(
      `select r.from_skill_id as skill_id, coalesce(s.mastery_state, 'UNKNOWN') as mastery_state
       from skill_relationships r
       left join student_skill_state s on s.skill_id = r.from_skill_id and s.student_id = $1
       where r.to_skill_id = $2 and r.relationship_type in ('PREREQUISITE', 'DEPENDS_ON')`,
      [studentId, skillId]
    );
    return rows.map((r) => ({ skillId: r.skill_id, state: r.mastery_state as MasteryState }));
  }

  async getSkillNamesByIds(ids: string[], client?: PoolClient): Promise<Map<string, string>> {
    const db = client ?? getPool();
    if (ids.length === 0) return new Map();
    const { rows } = await db.query(`select id, name from skill_nodes where id = any($1::uuid[])`, [ids]);
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async getRoleByKey(key: string, client?: PoolClient): Promise<{ id: string; name: string } | null> {
    const db = client ?? getPool();
    const { rows } = await db.query(`select id, name from roles where key = $1`, [key]);
    return rows[0] ? { id: rows[0].id, name: rows[0].name } : null;
  }

  async listRoleRequirements(roleKey: string, client?: PoolClient): Promise<{ skillId: string; importance: number; targetState: MasteryState }[]> {
    const db = client ?? getPool();
    const { rows } = await db.query(
      `select rq.skill_id, rq.importance, rq.target_state
       from role_skill_requirements rq
       join roles ro on ro.id = rq.role_id
       where ro.key = $1`,
      [roleKey]
    );
    return rows.map((r) => ({ skillId: r.skill_id, importance: Number(r.importance), targetState: r.target_state as MasteryState }));
  }
}
