import type { PoolClient } from "pg";
import type { MasteryHistoryEvent } from "../types/index.js";

function mapRow(r: any): MasteryHistoryEvent {
  return {
    id: r.id,
    studentId: r.student_id,
    skillId: r.skill_id,
    eventType: r.event_type,
    description: r.description,
    metadata: r.metadata,
    createdAt: r.created_at,
  };
}

export async function addHistoryEvent(
  client: PoolClient,
  input: { id: string; studentId: string; skillId: string; eventType: string; description: string; metadata?: Record<string, unknown> | null }
): Promise<MasteryHistoryEvent> {
  const { rows } = await client.query(
    `INSERT INTO mastery_history_events (id, student_id, skill_id, event_type, description, metadata)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [input.id, input.studentId, input.skillId, input.eventType, input.description, input.metadata ? JSON.stringify(input.metadata) : null]
  );
  return mapRow(rows[0]);
}

export async function listHistoryForSkill(client: PoolClient, studentId: string, skillId: string): Promise<MasteryHistoryEvent[]> {
  const { rows } = await client.query(
    `SELECT * FROM mastery_history_events WHERE student_id = $1 AND skill_id = $2 ORDER BY created_at ASC`,
    [studentId, skillId]
  );
  return rows.map(mapRow);
}
