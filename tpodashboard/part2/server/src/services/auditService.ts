import type Database from "better-sqlite3";
import { newId, nowIso } from "../util/id.js";

export interface AuditEntry {
  institutionId: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

export function recordAudit(db: Database.Database, entry: AuditEntry) {
  db.prepare(
    `insert into audit_log (id, institution_id, actor_id, entity_type, entity_id, action, before_value, after_value, created_at)
     values (@id, @institutionId, @actorId, @entityType, @entityId, @action, @before, @after, @createdAt)`
  ).run({
    id: newId(),
    institutionId: entry.institutionId,
    actorId: entry.actorId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before !== undefined ? JSON.stringify(entry.before) : null,
    after: entry.after !== undefined ? JSON.stringify(entry.after) : null,
    createdAt: nowIso(),
  });
}

export function listAuditForEntity(db: Database.Database, entityType: string, entityId: string) {
  return db
    .prepare(
      `select * from audit_log where entity_type = ? and entity_id = ? order by created_at desc`
    )
    .all(entityType, entityId);
}
