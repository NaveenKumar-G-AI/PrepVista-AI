import type { ValidationRunResult, Role } from "../../contracts/types.js";
import type { ValidationRunRepository, ValidationAuditRepository, CallerContext, AuditEvent } from "../ValidationRunRepository.js";

interface StoredRun {
  run: ValidationRunResult;
  tenantId: string | null;
  requestedBy: { role: Role; id: string };
}

function visibleTo(tenantId: string | null, caller: CallerContext): boolean {
  return tenantId === null || tenantId === caller.tenantId || caller.role === "ADMIN" || caller.role === "SYSTEM";
}

export class InMemoryValidationRunRepository implements ValidationRunRepository {
  private readonly runs: StoredRun[] = [];

  async save(run: ValidationRunResult, tenantId: string | null, requestedBy: { role: Role; id: string }): Promise<void> {
    this.runs.push({ run, tenantId, requestedBy });
  }

  async getById(caller: CallerContext, runId: string): Promise<ValidationRunResult | null> {
    const found = this.runs.find((r) => r.run.runId === runId);
    if (!found || !visibleTo(found.tenantId, caller)) return null;
    return found.run;
  }

  async getLatestForVersion(caller: CallerContext, versionId: string): Promise<ValidationRunResult | null> {
    const matches = this.runs.filter((r) => r.run.versionId === versionId && visibleTo(r.tenantId, caller));
    if (matches.length === 0) return null;
    return matches.reduce((latest, current) => (current.run.completedAt > latest.run.completedAt ? current : latest)).run;
  }

  async getHistoryForQuestion(caller: CallerContext, questionId: string): Promise<ValidationRunResult[]> {
    return this.runs
      .filter((r) => r.run.questionId === questionId && visibleTo(r.tenantId, caller))
      .map((r) => r.run)
      .sort((a, b) => a.versionNumber - b.versionNumber || a.completedAt.localeCompare(b.completedAt));
  }

  /** Test helper — not part of the interface. */
  clear(): void {
    this.runs.length = 0;
  }
}

export class InMemoryValidationAuditRepository implements ValidationAuditRepository {
  private readonly events: (AuditEvent & { id: string; occurredAt: string })[] = [];
  private counter = 0;

  async record(event: AuditEvent): Promise<string> {
    const id = `audit_${++this.counter}`;
    this.events.push({ ...event, id, occurredAt: new Date().toISOString() });
    return id;
  }

  /** Test helper. */
  all(): (AuditEvent & { id: string; occurredAt: string })[] {
    return [...this.events];
  }
}

export type { Role };
