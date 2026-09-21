import type { PoolClient } from "pg";

export async function logSystemEvent(
  client: PoolClient,
  input: { id: string; eventType: string; studentId?: string | null; skillId?: string | null; payload?: Record<string, unknown> | null }
): Promise<void> {
  await client.query(
    `INSERT INTO system_events (id, event_type, student_id, skill_id, payload) VALUES ($1,$2,$3,$4,$5)`,
    [input.id, input.eventType, input.studentId ?? null, input.skillId ?? null, input.payload ? JSON.stringify(input.payload) : null]
  );
}
