import { insertAuditEvent, queryAuditEvents, AuditQuery } from '../../db/repositories/auditRepo';

/**
 * Actions considered security-relevant for the Security Event Center view.
 * This is a filter over the ONE audit log, not a separate synthetic table —
 * every "security event" here is a real audit record, nothing is invented.
 */
export const SECURITY_EVENT_ACTIONS = [
  'auth.login_failed',
  'auth.account_locked',
  'auth.password_reset_requested',
  'auth.password_reset_completed',
  'user.role_changed',
  'user.status_changed',
  'user.sessions_force_revoked',
  'session.revoked',
  'session.revoked_others',
  'role.custom_role_created',
];

interface RecordAuditInput {
  institutionId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldState?: unknown;
  newState?: unknown;
  reason?: string;
  ipAddress?: string;
  correlationId?: string;
}

/** The only way any row is ever written to audit_events. There is no update/delete counterpart — see docs/ARCHITECTURE.md. */
export function recordAudit(input: RecordAuditInput) {
  return insertAuditEvent({
    institutionId: input.institutionId,
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    oldState: input.oldState !== undefined ? JSON.stringify(input.oldState) : null,
    newState: input.newState !== undefined ? JSON.stringify(input.newState) : null,
    reason: input.reason,
    ipAddress: input.ipAddress,
    correlationId: input.correlationId,
  });
}

export function listAudit(params: AuditQuery & { securityOnly?: boolean }) {
  const query: AuditQuery = { ...params };
  if (params.securityOnly) query.actionIn = SECURITY_EVENT_ACTIONS;
  return queryAuditEvents(query);
}
