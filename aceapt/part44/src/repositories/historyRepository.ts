import type pg from "pg";
import type { HistoryEventType } from "../domain/types.js";

export const historyRepository = {
  async record(
    client: pg.PoolClient,
    goalId: string,
    eventType: HistoryEventType,
    payload: Record<string, unknown> = {}
  ): Promise<void> {
    await client.query(
      "INSERT INTO goal_history_events (goal_id, event_type, payload) VALUES ($1,$2,$3)",
      [goalId, eventType, JSON.stringify(payload)]
    );
  },

  async listForGoal(client: pg.PoolClient, goalId: string) {
    const res = await client.query(
      "SELECT id, event_type, payload, created_at FROM goal_history_events WHERE goal_id = $1 ORDER BY created_at DESC",
      [goalId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      payload: r.payload,
      createdAt: r.created_at.toISOString(),
    }));
  },
};
