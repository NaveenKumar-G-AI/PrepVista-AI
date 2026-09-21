export type QuotaScope = 'USER' | 'ORGANIZATION' | 'FEATURE' | 'TASK';

export interface QuotaRecord {
  scope: QuotaScope;
  scopeRef: string;
  limitCount: number;
  usedCount: number;
  periodStart: string;
  periodEnd: string;
}

/**
 * Simple counting quota (e.g. "50 interview analyses per student per
 * day"), independent of dollar cost. Same single-threaded-atomicity
 * argument as BudgetEngine applies here — see that file's doc comment.
 */
export class QuotaEngine {
  private quotas = new Map<string, QuotaRecord>();

  private key(scope: QuotaScope, scopeRef: string): string {
    return `${scope}:${scopeRef}`;
  }

  configure(scope: QuotaScope, scopeRef: string, limitCount: number, periodStart: string, periodEnd: string): QuotaRecord {
    const key = this.key(scope, scopeRef);
    const existing = this.quotas.get(key);
    const record: QuotaRecord = { scope, scopeRef, limitCount, usedCount: existing?.usedCount ?? 0, periodStart, periodEnd };
    this.quotas.set(key, record);
    return record;
  }

  get(scope: QuotaScope, scopeRef: string): QuotaRecord | undefined {
    return this.quotas.get(this.key(scope, scopeRef));
  }

  list(): QuotaRecord[] {
    return [...this.quotas.values()];
  }

  /** Returns false (and does NOT increment) if the quota would be exceeded. */
  tryConsume(scope: QuotaScope, scopeRef: string, amount = 1): { ok: boolean; remaining: number } {
    const record = this.quotas.get(this.key(scope, scopeRef));
    if (!record) return { ok: true, remaining: Infinity }; // no quota configured for this scope = not this engine's concern

    if (this.periodExpired(record)) {
      record.usedCount = 0;
    }

    if (record.usedCount + amount > record.limitCount) {
      return { ok: false, remaining: Math.max(0, record.limitCount - record.usedCount) };
    }
    record.usedCount += amount; // synchronous — see BudgetEngine's atomicity note
    return { ok: true, remaining: record.limitCount - record.usedCount };
  }

  private periodExpired(record: QuotaRecord): boolean {
    return Date.now() > new Date(record.periodEnd).getTime();
  }
}

export const quotaEngine = new QuotaEngine();
