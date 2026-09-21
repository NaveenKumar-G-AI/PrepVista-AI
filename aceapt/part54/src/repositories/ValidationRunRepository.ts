import type { ValidationRunResult, Role } from "../contracts/types.js";

export interface CallerContext {
  tenantId: string | null;
  role: Role;
}

export interface ValidationRunRepository {
  save(run: ValidationRunResult, tenantId: string | null, requestedBy: { role: Role; id: string }): Promise<void>;
  getById(caller: CallerContext, runId: string): Promise<ValidationRunResult | null>;
  getLatestForVersion(caller: CallerContext, versionId: string): Promise<ValidationRunResult | null>;
  getHistoryForQuestion(caller: CallerContext, questionId: string): Promise<ValidationRunResult[]>;
}

export interface AuditEvent {
  tenantId: string | null;
  questionId: string | null;
  validationRunId: string | null;
  actorRole: Role;
  actorId: string;
  action: string;
  reason?: string;
}

export interface ValidationAuditRepository {
  record(event: AuditEvent): Promise<string>;
}
