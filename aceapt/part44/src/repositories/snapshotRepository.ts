import type pg from "pg";
import type { GoalSnapshotRecord, SnapshotTrigger } from "../domain/types.js";

function rowToSnapshot(row: any): GoalSnapshotRecord {
  return {
    id: row.id,
    goalId: row.goal_id,
    capturedAt: row.captured_at.toISOString(),
    trigger: row.trigger,
    currentCapability: row.current_capability,
    targetCapability: row.target_capability,
    gap: row.gap,
    prioritySkills: row.priority_skills,
    health: row.health,
    progress: Number(row.progress),
  };
}

export const snapshotRepository = {
  async create(
    client: pg.PoolClient,
    goalId: string,
    trigger: SnapshotTrigger,
    fields: {
      currentCapability: unknown;
      targetCapability: unknown;
      gap: unknown;
      prioritySkills: unknown;
      health: string;
      progress: number;
    }
  ): Promise<GoalSnapshotRecord> {
    const res = await client.query(
      `INSERT INTO goal_snapshots (goal_id, trigger, current_capability, target_capability, gap, priority_skills, health, progress)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        goalId,
        trigger,
        JSON.stringify(fields.currentCapability),
        JSON.stringify(fields.targetCapability),
        JSON.stringify(fields.gap),
        JSON.stringify(fields.prioritySkills),
        fields.health,
        fields.progress,
      ]
    );
    return rowToSnapshot(res.rows[0]);
  },

  async listForGoal(client: pg.PoolClient, goalId: string): Promise<GoalSnapshotRecord[]> {
    const res = await client.query(
      "SELECT * FROM goal_snapshots WHERE goal_id = $1 ORDER BY captured_at ASC",
      [goalId]
    );
    return res.rows.map(rowToSnapshot);
  },
};
