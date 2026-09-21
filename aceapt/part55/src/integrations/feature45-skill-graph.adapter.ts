import type pg from 'pg';
import type { SkillContext, SkillGraphPort } from './types.js';

/**
 * Feature 45 — Aptitude Skill Graph adapter.
 *
 * TODO(integration): replace this body with a call into the real Feature 45
 * service/client — in particular, real prerequisite-chain data. This
 * stand-in only resolves the direct skill_id off the question and the
 * skill's immediate parent as a crude prerequisite proxy; it does NOT
 * rebuild the skill graph (§41 is explicit that Feature 55 must not do
 * that), it just gives the rest of Feature 55 something real to call while
 * the real graph isn't available here.
 */
export class SqlSkillGraphAdapter implements SkillGraphPort {
  constructor(
    private readonly client: pg.PoolClient | pg.Pool,
    private readonly tenantId: string
  ) {}

  async getSkillContext(questionVersionId: string): Promise<SkillContext> {
    const { rows } = await this.client.query<{
      skill_id: string | null;
      skill_name: string | null;
      parent_skill_id: string | null;
    }>(
      `SELECT s.id AS skill_id, s.name AS skill_name, s.parent_skill_id
       FROM question_versions qv
       JOIN questions q ON q.id = qv.question_id
       LEFT JOIN skills s ON s.id = q.skill_id
       WHERE qv.id = $1 AND qv.tenant_id = $2`,
      [questionVersionId, this.tenantId]
    );
    const row = rows[0];
    if (!row || !row.skill_id) {
      return { skillId: null, skillName: null, prerequisiteSkillIds: [] };
    }
    return {
      skillId: row.skill_id,
      skillName: row.skill_name,
      prerequisiteSkillIds: row.parent_skill_id ? [row.parent_skill_id] : [],
    };
  }
}
