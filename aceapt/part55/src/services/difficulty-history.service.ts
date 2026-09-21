import type pg from 'pg';

export interface HistoryEntry {
  id: string;
  snapshotId: string | null;
  previousSnapshotId: string | null;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  actor: string;
  createdAt: Date;
}

/**
 * Append-only audit trail (§121, §158). Every field write goes through
 * `record` — nothing here ever UPDATEs or DELETEs a history row, so "why did
 * this change" can never be edited after the fact, only added to.
 */
export class DifficultyHistoryService {
  constructor(private readonly db: pg.PoolClient | pg.Pool) {}

  async record(entry: {
    tenantId: string;
    questionVersionId: string;
    snapshotId: string | null;
    previousSnapshotId: string | null;
    fieldChanged: string;
    oldValue: string | null;
    newValue: string | null;
    reason: string;
    actor?: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO difficulty_history
        (tenant_id, question_version_id, snapshot_id, previous_snapshot_id,
         field_changed, old_value, new_value, reason, actor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        entry.tenantId,
        entry.questionVersionId,
        entry.snapshotId,
        entry.previousSnapshotId,
        entry.fieldChanged,
        entry.oldValue,
        entry.newValue,
        entry.reason,
        entry.actor ?? 'SYSTEM',
      ]
    );
  }

  async getHistory(questionVersionId: string): Promise<HistoryEntry[]> {
    const { rows } = await this.db.query(
      `SELECT id, snapshot_id, previous_snapshot_id, field_changed, old_value,
              new_value, reason, actor, created_at
       FROM difficulty_history
       WHERE question_version_id = $1
       ORDER BY created_at DESC`,
      [questionVersionId]
    );
    return rows.map((r) => ({
      id: r.id,
      snapshotId: r.snapshot_id,
      previousSnapshotId: r.previous_snapshot_id,
      fieldChanged: r.field_changed,
      oldValue: r.old_value,
      newValue: r.new_value,
      reason: r.reason,
      actor: r.actor,
      createdAt: r.created_at,
    }));
  }
}
