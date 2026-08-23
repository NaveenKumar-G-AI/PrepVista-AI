import type { ActionStatus, ActorContext, AiAction, AuditEntry } from "../types/action.types.js";
import { auditRepo } from "../db/actionStore.js";
import { genAuditId, nowIso } from "../util/ids.js";

/**
 * Append-only audit trail (spec sections 36-37). Records enough to answer
 * "who did what, when, under what permission, with what result" without
 * storing unnecessary sensitive model context (raw prompts, chain-of-thought).
 */
export function auditLog(
  action: AiAction,
  event: string,
  ctx: ActorContext,
  opts?: { statusBefore?: ActionStatus; statusAfter?: ActionStatus; detail?: unknown }
): void {
  const entry: AuditEntry = {
    id: genAuditId(),
    actionId: action.id,
    institutionId: action.institutionId,
    event,
    userId: ctx.userId,
    role: ctx.role,
    sessionId: ctx.sessionId,
    statusBefore: opts?.statusBefore,
    statusAfter: opts?.statusAfter ?? action.status,
    detail: opts?.detail,
    createdAt: nowIso(),
  };
  auditRepo.append(entry);
}

export function getAuditTrail(actionId: string): AuditEntry[] {
  return auditRepo.forAction(actionId);
}
