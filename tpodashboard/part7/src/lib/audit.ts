import { db } from "../db/client";
import { auditLog } from "../db/schema";
import { newId } from "./id";

export interface AuditEntry {
  institutionId: string;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

/** Records actor, timestamp, old/new values and reason for a mutation
 *  (spec §64). Call this from services on every write that spec §64 lists —
 *  never from route handlers directly, so it can't be forgotten per-route. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    id: newId("audit"),
    institutionId: entry.institutionId,
    actorId: entry.actorId ?? null,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    reason: entry.reason ?? null,
  });
}
