import { randomUUID } from "node:crypto";
import { db } from "../db/client";

export const AnalyticsRepository = {
  record(type: string, studentId: string | null, payload: Record<string, unknown>) {
    db.prepare(
      `INSERT INTO analytics_events (id, type, student_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), type, studentId, JSON.stringify(payload), new Date().toISOString());
  },

  /** Aggregate, de-identified counts only — no per-student rows leave this
   * method, which is what makes the TPO endpoint safe to expose (§39, §40). */
  aggregateByType(sinceIso: string): { type: string; count: number }[] {
    return db
      .prepare(
        `SELECT type, COUNT(*) as count FROM analytics_events WHERE created_at >= ? GROUP BY type`
      )
      .all(sinceIso) as { type: string; count: number }[];
  },
};

export const AuditRepository = {
  log(actorId: string | null, action: string, resource: string, metadata: Record<string, unknown> = {}) {
    db.prepare(
      `INSERT INTO audit_log (id, actor_id, action, resource, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), actorId, action, resource, JSON.stringify(metadata), new Date().toISOString());
  },
};
