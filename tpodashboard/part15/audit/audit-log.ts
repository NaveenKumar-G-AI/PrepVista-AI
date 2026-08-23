/**
 * PrepVista AI — Part 15
 * Append-only audit log (Section 54). In-memory for this build — production
 * should persist to the `strategy_audit_log` table (see migrations/0001_*.sql)
 * with the same shape so nothing needs to change at call sites.
 */

import type { AuditEntry, CallerContext } from "../types/placement-strategy.types.js";

export class AuditLog {
  private entries: AuditEntry[] = [];
  private idCounter = 0;

  record(caller: CallerContext, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}): AuditEntry {
    const entry: AuditEntry = {
      id: `audit-${++this.idCounter}`,
      timestamp: new Date().toISOString(),
      actorId: caller.userId,
      actorRole: caller.role,
      action,
      targetType,
      targetId,
      metadata,
    };
    this.entries.push(entry);
    return entry;
  }

  query(filter: Partial<Pick<AuditEntry, "actorRole" | "targetType" | "action">> = {}): AuditEntry[] {
    return this.entries.filter((e) =>
      (filter.actorRole === undefined || e.actorRole === filter.actorRole) &&
      (filter.targetType === undefined || e.targetType === filter.targetType) &&
      (filter.action === undefined || e.action === filter.action)
    );
  }

  all(): AuditEntry[] {
    return this.entries;
  }
}

export const auditLog = new AuditLog();
