import type pg from "pg";
import type { GoalMilestone } from "../domain/types.js";

function rowToMilestone(row: any): GoalMilestone {
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    description: row.description,
    sequence: row.sequence,
    status: row.status,
    targetState: row.target_state ?? {},
    evidenceRequired: row.evidence_required,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export const milestoneRepository = {
  async createMany(
    client: pg.PoolClient,
    goalId: string,
    milestones: { title: string; description: string; sequence: number; targetState: unknown; evidenceRequired: string }[]
  ): Promise<GoalMilestone[]> {
    const created: GoalMilestone[] = [];
    for (const m of milestones) {
      const res = await client.query(
        `INSERT INTO goal_milestones (goal_id, title, description, sequence, target_state, evidence_required, status)
         VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $4 = 1 THEN 'ACTIVE' ELSE 'UPCOMING' END)
         RETURNING *`,
        [goalId, m.title, m.description, m.sequence, JSON.stringify(m.targetState), m.evidenceRequired]
      );
      created.push(rowToMilestone(res.rows[0]));
    }
    return created;
  },

  async listForGoal(client: pg.PoolClient, goalId: string): Promise<GoalMilestone[]> {
    const res = await client.query(
      "SELECT * FROM goal_milestones WHERE goal_id = $1 ORDER BY sequence ASC",
      [goalId]
    );
    return res.rows.map(rowToMilestone);
  },

  async markAchieved(client: pg.PoolClient, id: string): Promise<GoalMilestone> {
    const res = await client.query(
      `UPDATE goal_milestones SET status = 'ACHIEVED', completed_at = now() WHERE id = $1 RETURNING *`,
      [id]
    );
    return rowToMilestone(res.rows[0]);
  },

  async activateNext(client: pg.PoolClient, goalId: string, afterSequence: number): Promise<void> {
    await client.query(
      `UPDATE goal_milestones SET status = 'ACTIVE'
       WHERE goal_id = $1 AND sequence = (
         SELECT MIN(sequence) FROM goal_milestones WHERE goal_id = $1 AND sequence > $2 AND status = 'UPCOMING'
       )`,
      [goalId, afterSequence]
    );
  },
};
