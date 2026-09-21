import { db } from '../db/client';
import { newId } from '../utils/ids';

/** Event names match spec sec. 238 exactly so a real analytics pipeline can subscribe 1:1. */
export type AnalyticsEventType =
  | 'shortcut_created'
  | 'shortcut_saved'
  | 'shortcut_viewed'
  | 'shortcut_test_started'
  | 'shortcut_test_completed'
  | 'shortcut_used'
  | 'shortcut_success'
  | 'shortcut_failure'
  | 'shortcut_discovered'
  | 'shortcut_verified'
  | 'shortcut_trusted'
  | 'shortcut_review_required'
  | 'shortcut_regressed'
  | 'shortcut_deprecated'
  | 'shortcut_training_started'
  | 'shortcut_training_completed'
  | 'strategy_switch'
  | 'strategy_selection'
  | 'strategy_transfer'
  | 'strategy_retention';

export function logEvent(input: { tenantId: string; studentId?: string | null; eventType: AnalyticsEventType; payload?: unknown }): void {
  db.prepare(`INSERT INTO analytics_events (id, tenant_id, student_id, event_type, payload) VALUES (?, ?, ?, ?, ?)`).run(
    newId('evt'),
    input.tenantId,
    input.studentId ?? null,
    input.eventType,
    JSON.stringify(input.payload ?? {})
  );
}

export function countEvents(eventType: AnalyticsEventType, tenantId?: string): number {
  const row = tenantId
    ? (db.prepare(`SELECT COUNT(*) as n FROM analytics_events WHERE event_type = ? AND tenant_id = ?`).get(eventType, tenantId) as {
        n: number;
      })
    : (db.prepare(`SELECT COUNT(*) as n FROM analytics_events WHERE event_type = ?`).get(eventType) as { n: number });
  return row.n;
}
