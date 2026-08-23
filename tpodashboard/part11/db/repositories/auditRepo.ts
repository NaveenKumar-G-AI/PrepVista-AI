import { db, genId } from '../../src/lib/db';
import { AuditEventRow } from '../../src/types/models';

function mapRow(row: any): AuditEventRow {
  return {
    id: row.id, institutionId: row.institution_id, actorId: row.actor_id, action: row.action,
    entityType: row.entity_type, entityId: row.entity_id, oldState: row.old_state, newState: row.new_state,
    reason: row.reason, ipAddress: row.ip_address, correlationId: row.correlation_id, createdAt: row.created_at,
  };
}

export function insertAuditEvent(input: {
  institutionId: string; actorId?: string | null; action: string; entityType: string; entityId: string;
  oldState?: string | null; newState?: string | null; reason?: string | null;
  ipAddress?: string | null; correlationId?: string | null;
}): AuditEventRow {
  const id = genId();
  db.prepare(`INSERT INTO audit_events
    (id, institution_id, actor_id, action, entity_type, entity_id, old_state, new_state, reason, ip_address, correlation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.institutionId, input.actorId ?? null, input.action, input.entityType, input.entityId,
    input.oldState ?? null, input.newState ?? null, input.reason ?? null, input.ipAddress ?? null, input.correlationId ?? null,
  );
  return mapRow(db.prepare('SELECT * FROM audit_events WHERE id = ?').get(id));
}

export interface AuditQuery {
  institutionId: string; actorId?: string; action?: string; entityType?: string;
  actionIn?: string[]; from?: string; to?: string; page?: number; pageSize?: number;
}

export interface AuditQueryResult {
  total: number;
  page: number;
  pageSize: number;
  events: (AuditEventRow & { actorName: string | null; actorEmail: string | null })[];
}

export function queryAuditEvents(q: AuditQuery): AuditQueryResult {
  const page = q.page ?? 1;
  const pageSize = Math.min(q.pageSize ?? 50, 200);
  const clauses: string[] = ['ae.institution_id = ?'];
  const params: any[] = [q.institutionId];

  if (q.actorId) { clauses.push('ae.actor_id = ?'); params.push(q.actorId); }
  if (q.action) { clauses.push('ae.action = ?'); params.push(q.action); }
  if (q.entityType) { clauses.push('ae.entity_type = ?'); params.push(q.entityType); }
  if (q.actionIn && q.actionIn.length > 0) {
    clauses.push(`ae.action IN (${q.actionIn.map(() => '?').join(',')})`);
    params.push(...q.actionIn);
  }
  if (q.from) { clauses.push('ae.created_at >= ?'); params.push(q.from); }
  if (q.to) { clauses.push('ae.created_at <= ?'); params.push(q.to); }

  const where = clauses.join(' AND ');
  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM audit_events ae WHERE ${where}`).get(...params) as any;

  const rows = db.prepare(`
    SELECT ae.*, u.name as actor_name, u.email as actor_email
    FROM audit_events ae LEFT JOIN users u ON u.id = ae.actor_id
    WHERE ${where}
    ORDER BY ae.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as any[];

  return {
    total: totalRow.count as number,
    page, pageSize,
    events: rows.map(r => ({ ...mapRow(r), actorName: r.actor_name, actorEmail: r.actor_email })),
  };
}
