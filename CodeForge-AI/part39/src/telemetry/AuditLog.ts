import { redact } from '../errors';

export type AuditEventType =
  | 'AI_REQUEST'
  | 'MODEL_SELECTED'
  | 'PROVIDER_SELECTED'
  | 'POLICY_APPLIED'
  | 'FALLBACK_TRIGGERED'
  | 'BUDGET_BLOCKED'
  | 'QUOTA_BLOCKED'
  | 'RATE_LIMIT_TRIGGERED'
  | 'PROVIDER_FAILURE'
  | 'EMERGENCY_CONTROL'
  | 'CONFIGURATION_CHANGE';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  organizationId?: string;
  actorId?: string;
  actorRole?: string;
  target?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

let seq = 0;

/**
 * Records operational events for compliance/debugging. Every `details`
 * payload is passed through redact() before it is stored, so a caller
 * accidentally including a header object or provider request body can
 * never leak a credential into the audit trail. This log intentionally
 * does NOT store prompt/response content — see docs/COMPLETION_REPORT.md
 * "Prompt/response storage" for where that's controlled instead.
 */
export class AuditLog {
  private events: AuditEvent[] = [];

  record(type: AuditEventType, details: Record<string, unknown>, ctx?: { organizationId?: string; actorId?: string; actorRole?: string; target?: string }): AuditEvent {
    const event: AuditEvent = {
      id: `evt_${Date.now()}_${seq++}`,
      type,
      organizationId: ctx?.organizationId,
      actorId: ctx?.actorId,
      actorRole: ctx?.actorRole,
      target: ctx?.target,
      details: redact(details) as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    };
    this.events.push(event);
    return event;
  }

  /** Tenant-scoped by construction — callers must always pass organizationId, there is no "all orgs" query on this method. */
  listForOrganization(organizationId: string, limit = 200): AuditEvent[] {
    return this.events
      .filter((e) => e.organizationId === organizationId)
      .slice(-limit)
      .reverse();
  }

  /** Platform-wide view — restrict to PLATFORM_ADMIN/ENGINEERING_OPERATOR at the API layer, never expose unrestricted. */
  listAll(limit = 500): AuditEvent[] {
    return this.events.slice(-limit).reverse();
  }
}

export const auditLog = new AuditLog();
