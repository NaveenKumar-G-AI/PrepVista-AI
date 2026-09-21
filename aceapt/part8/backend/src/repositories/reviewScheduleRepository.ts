import type { PoolClient } from "pg";
import type { ReviewScheduleItem } from "../types/index.js";

function mapRow(r: any): ReviewScheduleItem {
  return {
    id: r.id,
    studentId: r.student_id,
    skillId: r.skill_id,
    priorityScore: Number(r.priority_score),
    reason: r.reason,
    dueAt: r.due_at,
    estimatedMinutes: r.estimated_minutes,
    status: r.status,
    updatedAt: r.updated_at,
  };
}

export async function upsertReviewEntry(
  client: PoolClient,
  input: { id: string; studentId: string; skillId: string; priorityScore: number; reason: string; dueAt: string; estimatedMinutes: number; status?: string }
): Promise<ReviewScheduleItem> {
  const { rows } = await client.query(
    `INSERT INTO review_schedule (id, student_id, skill_id, priority_score, reason, due_at, estimated_minutes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'PENDING'))
     ON CONFLICT (student_id, skill_id) DO UPDATE SET
       priority_score = EXCLUDED.priority_score,
       reason = EXCLUDED.reason,
       due_at = EXCLUDED.due_at,
       estimated_minutes = EXCLUDED.estimated_minutes,
       status = EXCLUDED.status,
       updated_at = now()
     RETURNING *`,
    [input.id, input.studentId, input.skillId, input.priorityScore, input.reason, input.dueAt, input.estimatedMinutes, input.status ?? null]
  );
  return mapRow(rows[0]);
}

export async function listReviewQueue(client: PoolClient, studentId: string, limit: number): Promise<ReviewScheduleItem[]> {
  const { rows } = await client.query(
    `SELECT * FROM review_schedule
     WHERE student_id = $1 AND status = 'PENDING' AND due_at <= now()
     ORDER BY priority_score DESC
     LIMIT $2`,
    [studentId, limit]
  );
  return rows.map(mapRow);
}

export async function markReviewEntryStatus(client: PoolClient, studentId: string, skillId: string, status: string): Promise<void> {
  await client.query(
    `UPDATE review_schedule SET status = $3, updated_at = now() WHERE student_id = $1 AND skill_id = $2`,
    [studentId, skillId, status]
  );
}

/** Service-scope only: every student x skill pair that has ANY mastery_state row,
 *  used by the nightly review sweep. Runs under aceapt_service (BYPASSRLS). */
export async function listAllStudentSkillPairsWithState(client: PoolClient): Promise<{ studentId: string; skillId: string }[]> {
  const { rows } = await client.query(`SELECT student_id, skill_id FROM mastery_state`);
  return rows.map((r) => ({ studentId: r.student_id, skillId: r.skill_id }));
}
