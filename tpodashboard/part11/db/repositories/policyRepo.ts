import { db, genId } from '../../src/lib/db';
import { PolicyRow } from '../../src/types/models';

function mapRow(row: any): PolicyRow {
  return {
    id: row.id, institutionId: row.institution_id, key: row.key, version: row.version, status: row.status,
    effectiveDate: row.effective_date, config: row.config, changedById: row.changed_by_id,
    reason: row.reason, createdAt: row.created_at,
  };
}

export function findActivePolicy(institutionId: string, key: string): PolicyRow | undefined {
  const row = db.prepare("SELECT * FROM policies WHERE institution_id = ? AND key = ? AND status = 'ACTIVE'").get(institutionId, key);
  return row ? mapRow(row) : undefined;
}

export function listActivePolicies(institutionId: string): PolicyRow[] {
  return (db.prepare("SELECT * FROM policies WHERE institution_id = ? AND status = 'ACTIVE' ORDER BY key").all(institutionId) as any[]).map(mapRow);
}

export function listPolicyHistory(institutionId: string, key: string): PolicyRow[] {
  return (db.prepare('SELECT * FROM policies WHERE institution_id = ? AND key = ? ORDER BY version DESC').all(institutionId, key) as any[]).map(mapRow);
}

export function createPolicyVersion(input: {
  institutionId: string; key: string; version: number; effectiveDate: string; config: string;
  changedById: string; reason?: string | null;
}): PolicyRow {
  const id = genId();
  db.prepare(`INSERT INTO policies (id, institution_id, key, version, status, effective_date, config, changed_by_id, reason)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`).run(
    id, input.institutionId, input.key, input.version, input.effectiveDate, input.config, input.changedById, input.reason ?? null,
  );
  return mapRow(db.prepare('SELECT * FROM policies WHERE id = ?').get(id));
}

export function supersedePolicy(id: string): void {
  db.prepare("UPDATE policies SET status = 'SUPERSEDED' WHERE id = ?").run(id);
}
