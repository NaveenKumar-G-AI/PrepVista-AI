import { randomUUID } from 'crypto';
import { config } from '../config';

export enum BudgetScope {
  GLOBAL = 'GLOBAL',
  ORGANIZATION = 'ORGANIZATION',
  FEATURE = 'FEATURE',
  USER = 'USER',
}

export type BudgetPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface BudgetRecord {
  id: string;
  scope: BudgetScope;
  scopeRef: string;
  period: BudgetPeriod;
  limitUsd: number;
  usedUsd: number;
  warningThresholdPct: number;
  hardLimit: boolean;
  periodStart: string;
  periodEnd: string;
}

export type BudgetLimitPolicy = 'REJECT' | 'DEGRADE' | 'QUEUE';

export interface ReservationResult {
  ok: boolean;
  reservationId?: string;
  remainingUsd: number;
  budgetId?: string;
  warning: boolean;
}

/**
 * Reserve-then-settle budget accounting.
 *
 * WHY RESERVE FIRST: actual cost isn't known until the provider responds
 * (output token count is unknown up front), but we must not let spend run
 * past a hard limit while a batch of requests is in flight. So we reserve
 * an ESTIMATED cost synchronously before calling the provider, then
 * settle the delta against the real cost afterward (or fully release the
 * reservation if the call fails and no usage occurred).
 *
 * WHY THIS IS RACE-SAFE IN-PROCESS: Node is single-threaded, and
 * `reserve()` performs its check-then-increment with no `await` in
 * between, so the JS event loop cannot interleave two reservations
 * against the same budget — see tests/budgetEngine.test.ts, which fires
 * 50 concurrent reservations against a budget sized for exactly 5 and
 * asserts precisely 5 succeed with zero overshoot.
 *
 * PRODUCTION / MULTI-INSTANCE NOTE: this in-memory implementation is only
 * safe within a single Node process. A Postgres-backed implementation
 * should use the equivalent atomic pattern:
 *   UPDATE ai_budget
 *      SET used_amount = used_amount + $reserveAmount
 *    WHERE id = $id AND used_amount + $reserveAmount <= limit_amount
 *  RETURNING *;
 * (an atomic conditional UPDATE, or SELECT ... FOR UPDATE) — never a
 * separate SELECT-then-UPDATE, which reintroduces the race this class
 * exists to prevent.
 */
export class BudgetEngine {
  private budgets = new Map<string, BudgetRecord>();
  private reservations = new Map<string, { budgetId: string; amountUsd: number }>();

  private key(scope: BudgetScope, scopeRef: string): string {
    return `${scope}:${scopeRef}`;
  }

  upsertBudget(input: Omit<BudgetRecord, 'id' | 'usedUsd'> & { id?: string; usedUsd?: number }): BudgetRecord {
    const key = this.key(input.scope, input.scopeRef);
    const existing = [...this.budgets.values()].find((b) => this.key(b.scope, b.scopeRef) === key);
    const record: BudgetRecord = {
      id: existing?.id ?? input.id ?? randomUUID(),
      scope: input.scope,
      scopeRef: input.scopeRef,
      period: input.period,
      limitUsd: input.limitUsd,
      usedUsd: input.usedUsd ?? existing?.usedUsd ?? 0,
      warningThresholdPct: input.warningThresholdPct,
      hardLimit: input.hardLimit,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    };
    this.budgets.set(record.id, record);
    return record;
  }

  getBudget(scope: BudgetScope, scopeRef: string): BudgetRecord | undefined {
    return [...this.budgets.values()].find((b) => this.key(b.scope, b.scopeRef) === this.key(scope, scopeRef));
  }

  listBudgets(): BudgetRecord[] {
    return [...this.budgets.values()];
  }

  /**
   * Atomically reserves `estimatedUsd` against every configured budget
   * scope that applies to this request (global, org, feature, user — any
   * that are configured). If NONE are configured anywhere, falls back to
   * a safe default org-scoped daily budget rather than allowing unlimited
   * spend (see config.safeDefaults.dailyBudgetUsd).
   *
   * Returns the FIRST scope that blocks, if any — all reservations made
   * before the block are rolled back so a rejected request never leaves
   * partial reservations behind.
   */
  reserveAcrossScopes(scopes: Array<{ scope: BudgetScope; scopeRef: string }>, estimatedUsd: number): { ok: boolean; reservationIds: string[]; blockedScope?: BudgetScope; remainingUsd?: number; warning: boolean } {
    const applicable = scopes.filter((s) => this.getBudget(s.scope, s.scopeRef));
    const effectiveScopes = applicable.length > 0 ? applicable : this.fallbackScopes(scopes);

    const reservationIds: string[] = [];
    let anyWarning = false;

    for (const s of effectiveScopes) {
      const result = this.reserve(s.scope, s.scopeRef, estimatedUsd);
      if (!result.ok) {
        // Roll back everything reserved so far in this batch.
        for (const id of reservationIds) this.release(id);
        return { ok: false, reservationIds: [], blockedScope: s.scope, remainingUsd: result.remainingUsd, warning: false };
      }
      if (result.warning) anyWarning = true;
      if (result.reservationId) reservationIds.push(result.reservationId);
    }

    return { ok: true, reservationIds, warning: anyWarning };
  }

  private fallbackScopes(scopes: Array<{ scope: BudgetScope; scopeRef: string }>): Array<{ scope: BudgetScope; scopeRef: string }> {
    // Never fully unlimited: materialize a safe-default daily org budget
    // on first use if the operator hasn't configured anything yet.
    const org = scopes.find((s) => s.scope === BudgetScope.ORGANIZATION);
    if (!org) return [];
    if (!this.getBudget(BudgetScope.ORGANIZATION, org.scopeRef)) {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
      this.upsertBudget({
        scope: BudgetScope.ORGANIZATION,
        scopeRef: org.scopeRef,
        period: 'DAILY',
        limitUsd: config.safeDefaults.dailyBudgetUsd,
        warningThresholdPct: 80,
        hardLimit: true,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
    }
    return [org];
  }

  /** Synchronous by design — see class doc for why that matters. */
  private reserve(scope: BudgetScope, scopeRef: string, amountUsd: number): ReservationResult {
    const budget = this.getBudget(scope, scopeRef);
    if (!budget) return { ok: true, remainingUsd: Infinity, warning: false };

    const projected = budget.usedUsd + amountUsd;
    if (projected > budget.limitUsd) {
      if (budget.hardLimit) {
        return { ok: false, remainingUsd: Math.max(0, budget.limitUsd - budget.usedUsd), warning: false };
      }
      // Soft limit: allow it through, but flag it — the caller's policy
      // decides what DEGRADE/QUEUE means for this request type.
    }

    budget.usedUsd = projected; // no await between the check above and this write
    const reservationId = randomUUID();
    this.reservations.set(reservationId, { budgetId: budget.id, amountUsd: amountUsd });

    const warning = projected >= budget.limitUsd * (budget.warningThresholdPct / 100);
    return { ok: true, reservationId, remainingUsd: Math.max(0, budget.limitUsd - projected), budgetId: budget.id, warning };
  }

  /** Adjusts a reservation to the real cost once it's known (can be higher or lower than the estimate). */
  settle(reservationId: string, actualUsd: number): void {
    const res = this.reservations.get(reservationId);
    if (!res) return;
    const budget = [...this.budgets.values()].find((b) => b.id === res.budgetId);
    if (budget) {
      budget.usedUsd = Math.max(0, budget.usedUsd - res.amountUsd + actualUsd);
    }
    this.reservations.delete(reservationId);
  }

  /** Fully releases a reservation (e.g. the call failed before any usage occurred). */
  release(reservationId: string): void {
    const res = this.reservations.get(reservationId);
    if (!res) return;
    const budget = [...this.budgets.values()].find((b) => b.id === res.budgetId);
    if (budget) budget.usedUsd = Math.max(0, budget.usedUsd - res.amountUsd);
    this.reservations.delete(reservationId);
  }
}

export const budgetEngine = new BudgetEngine();
