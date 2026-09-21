import { getDb, toJson } from '../db/db';
import { newId, nowIso } from './ids';

/**
 * Minimal audit log (section 45/46: "audit logs" as a basic integrity
 * foundation). Every security/state-changing action funnels through here so
 * there's a durable record independent of application logs.
 */
export function audit(action: string, actorStudentId: string | null, details?: Record<string, unknown>): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_log (id, at, actor_student_id, action, details_json) VALUES (?, ?, ?, ?, ?)`
    ).run(newId('audit'), nowIso(), actorStudentId, action, toJson(details ?? {}));
  } catch (err) {
    // Audit logging must never break the primary request flow.
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write audit log entry', err);
  }
}

export function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log('[aceapt-f6]', ...args);
}

export function logError(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error('[aceapt-f6]', ...args);
}
