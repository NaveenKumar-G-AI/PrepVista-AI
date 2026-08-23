import type { ActionResult, ActionStatus, AiAction, AuditEntry } from "../types/action.types.js";

/**
 * In-memory action store. In production this is the `ai_action` table
 * (spec section 6). Swap this module for a real repository backed by your
 * database of record — the ActionEngine only depends on this narrow interface.
 */
class ActionRepository {
  private byId = new Map<string, AiAction>();

  save(action: AiAction): AiAction {
    action.updatedAt = new Date().toISOString();
    this.byId.set(action.id, { ...action });
    return action;
  }

  get(id: string): AiAction | undefined {
    const a = this.byId.get(id);
    return a ? { ...a } : undefined;
  }

  listForInstitution(institutionId: string): AiAction[] {
    return [...this.byId.values()].filter((a) => a.institutionId === institutionId);
  }

  listForUser(institutionId: string, userId: string): AiAction[] {
    return this.listForInstitution(institutionId).filter((a) => a.userId === userId);
  }
}

class AuditRepository {
  private entries: AuditEntry[] = [];

  append(entry: AuditEntry) {
    this.entries.push(entry);
  }

  forAction(actionId: string): AuditEntry[] {
    return this.entries.filter((e) => e.actionId === actionId);
  }

  forInstitution(institutionId: string): AuditEntry[] {
    return this.entries.filter((e) => e.institutionId === institutionId);
  }

  all(): AuditEntry[] {
    return [...this.entries];
  }
}

interface CachedExecution {
  status: ActionStatus;
  result: ActionResult;
}

/**
 * Idempotency store keyed by the deterministic idempotency key (util/ids.ts).
 * This is what prevents duplicate sends/assignments/writes on retry, on
 * duplicate client submission, or on a client re-confirming an already-executed
 * action (spec section 28-29, and the "Duplicate request -> Idempotency ->
 * Single final effect" regression scenario in section 89).
 */
class IdempotencyRepository {
  private cache = new Map<string, CachedExecution>();

  get(key: string): CachedExecution | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: CachedExecution) {
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }
}

export const actionRepo = new ActionRepository();
export const auditRepo = new AuditRepository();
export const idempotencyRepo = new IdempotencyRepository();
