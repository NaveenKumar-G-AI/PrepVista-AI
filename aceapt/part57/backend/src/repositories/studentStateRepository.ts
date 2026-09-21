import { db } from '../db/client';
import { newId } from '../utils/ids';
import type { StudentShortcutStateRow } from '../domain/types';
import type { TrustState } from '../domain/enums';

export function getState(studentId: string, shortcutId: string): StudentShortcutStateRow | undefined {
  return db
    .prepare(`SELECT * FROM student_shortcut_states WHERE student_id = ? AND shortcut_id = ?`)
    .get(studentId, shortcutId) as StudentShortcutStateRow | undefined;
}

export function getOrCreateState(tenantId: string, studentId: string, shortcutId: string): StudentShortcutStateRow {
  const existing = getState(studentId, shortcutId);
  if (existing) return existing;
  const id = newId('sstate');
  db.prepare(
    `INSERT INTO student_shortcut_states (id, tenant_id, student_id, shortcut_id, state)
     VALUES (?, ?, ?, ?, 'EXPERIMENTAL')`
  ).run(id, tenantId, studentId, shortcutId);
  return getState(studentId, shortcutId)!;
}

export function listStatesForStudent(studentId: string): StudentShortcutStateRow[] {
  return db.prepare(`SELECT * FROM student_shortcut_states WHERE student_id = ?`).all(studentId) as StudentShortcutStateRow[];
}

export function listStatesByTrust(tenantId: string, states: TrustState[]): StudentShortcutStateRow[] {
  const placeholders = states.map(() => '?').join(',');
  return db
    .prepare(`SELECT * FROM student_shortcut_states WHERE tenant_id = ? AND state IN (${placeholders})`)
    .all(tenantId, ...states) as StudentShortcutStateRow[];
}

export interface UpdateStateInput {
  state: TrustState;
  reliability: number;
  usageCount: number;
  successCount: number;
  avgTimeSavedRatio: number | null;
  lastUsedAt: string;
}

export function updateStateAfterUsage(id: string, input: UpdateStateInput): void {
  db.prepare(
    `UPDATE student_shortcut_states
     SET state = @state, reliability = @reliability, usage_count = @usage_count, success_count = @success_count,
         avg_time_saved_ratio = @avg_time_saved_ratio, last_used_at = @last_used_at, updated_at = datetime('now')
     WHERE id = @id`
  ).run({
    id,
    state: input.state,
    reliability: input.reliability,
    usage_count: input.usageCount,
    success_count: input.successCount,
    avg_time_saved_ratio: input.avgTimeSavedRatio,
    last_used_at: input.lastUsedAt,
  });
}

export function setPreference(id: string, patch: { preferred?: boolean; pinned?: boolean; notes?: string }): void {
  const current = db.prepare(`SELECT * FROM student_shortcut_states WHERE id = ?`).get(id) as StudentShortcutStateRow;
  db.prepare(
    `UPDATE student_shortcut_states SET preferred = @preferred, pinned = @pinned, notes = @notes, updated_at = datetime('now') WHERE id = @id`
  ).run({
    id,
    preferred: (patch.preferred ?? Boolean(current.preferred)) ? 1 : 0,
    pinned: (patch.pinned ?? Boolean(current.pinned)) ? 1 : 0,
    notes: patch.notes ?? current.notes,
  });
}

export function updateTransferEvidence(id: string, evidence: unknown): void {
  db.prepare(`UPDATE student_shortcut_states SET transfer_evidence = ?, updated_at = datetime('now') WHERE id = ?`).run(
    JSON.stringify(evidence),
    id
  );
}

export function updateRetentionEvidence(id: string, evidence: unknown): void {
  db.prepare(`UPDATE student_shortcut_states SET retention_evidence = ?, updated_at = datetime('now') WHERE id = ?`).run(
    JSON.stringify(evidence),
    id
  );
}
