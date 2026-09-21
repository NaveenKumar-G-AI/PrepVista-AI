import { BudgetEngine, BudgetScope } from '../src/budget/BudgetEngine';

function periodWindow() {
  const start = new Date();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

describe('BudgetEngine — GOLDEN BUDGET TEST (race conditions)', () => {
  it('under 50 concurrent reservations against a budget sized for exactly 5, exactly 5 succeed and used never overshoots the limit', async () => {
    const engine = new BudgetEngine();
    engine.upsertBudget({ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1', period: 'DAILY', limitUsd: 5, warningThresholdPct: 80, hardLimit: true, ...periodWindow() });

    const attempts = Array.from({ length: 50 }, () =>
      // Scheduled as separate microtasks so they genuinely interleave at
      // the event-loop level — the property under test is that
      // reserveAcrossScopes' internal check-then-increment has no `await`
      // in between, so no two of these can ever both observe the same
      // "remaining budget" before either commits.
      Promise.resolve().then(() => engine.reserveAcrossScopes([{ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1' }], 1))
    );

    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);

    expect(successes.length).toBe(5);
    expect(failures.length).toBe(45);
    expect(engine.getBudget(BudgetScope.ORGANIZATION, 'org1')!.usedUsd).toBe(5); // never overshoots
  });

  it('never allows a hard-limit budget to be exceeded even by a single reservation larger than the remaining amount', () => {
    const engine = new BudgetEngine();
    engine.upsertBudget({ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1', period: 'DAILY', limitUsd: 10, warningThresholdPct: 80, hardLimit: true, ...periodWindow() });

    const first = engine.reserveAcrossScopes([{ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1' }], 8);
    expect(first.ok).toBe(true);

    const second = engine.reserveAcrossScopes([{ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1' }], 5); // would bring total to 13 > 10
    expect(second.ok).toBe(false);
    expect(engine.getBudget(BudgetScope.ORGANIZATION, 'org1')!.usedUsd).toBe(8); // unchanged by the rejected attempt
  });
});

describe('BudgetEngine — reserve / settle / release', () => {
  it('settle() adjusts used amount down when actual cost is lower than the estimate', () => {
    const engine = new BudgetEngine();
    engine.upsertBudget({ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1', period: 'DAILY', limitUsd: 100, warningThresholdPct: 80, hardLimit: true, ...periodWindow() });

    const res = engine.reserveAcrossScopes([{ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1' }], 2.0);
    expect(res.ok).toBe(true);
    engine.settle(res.reservationIds[0], 1.5);

    expect(engine.getBudget(BudgetScope.ORGANIZATION, 'org1')!.usedUsd).toBe(1.5);
  });

  it('settle() adjusts used amount up when actual cost exceeds the estimate', () => {
    const engine = new BudgetEngine();
    engine.upsertBudget({ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1', period: 'DAILY', limitUsd: 100, warningThresholdPct: 80, hardLimit: true, ...periodWindow() });

    const res = engine.reserveAcrossScopes([{ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1' }], 1.0);
    engine.settle(res.reservationIds[0], 1.4);

    expect(engine.getBudget(BudgetScope.ORGANIZATION, 'org1')!.usedUsd).toBe(1.4);
  });

  it('release() fully refunds a reservation (e.g. the call failed before any usage occurred)', () => {
    const engine = new BudgetEngine();
    engine.upsertBudget({ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1', period: 'DAILY', limitUsd: 100, warningThresholdPct: 80, hardLimit: true, ...periodWindow() });

    const res = engine.reserveAcrossScopes([{ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1' }], 3.0);
    for (const id of res.reservationIds) engine.release(id);

    expect(engine.getBudget(BudgetScope.ORGANIZATION, 'org1')!.usedUsd).toBe(0);
  });

  it('rolls back earlier scope reservations in the same batch if a later scope blocks', () => {
    const engine = new BudgetEngine();
    engine.upsertBudget({ scope: BudgetScope.ORGANIZATION, scopeRef: 'org1', period: 'DAILY', limitUsd: 100, warningThresholdPct: 80, hardLimit: true, ...periodWindow() });
    engine.upsertBudget({ scope: BudgetScope.FEATURE, scopeRef: 'expensive-feature', period: 'DAILY', limitUsd: 1, warningThresholdPct: 80, hardLimit: true, ...periodWindow() });

    const result = engine.reserveAcrossScopes(
      [
        { scope: BudgetScope.ORGANIZATION, scopeRef: 'org1' },
        { scope: BudgetScope.FEATURE, scopeRef: 'expensive-feature' }, // this one blocks
      ],
      5
    );

    expect(result.ok).toBe(false);
    expect(result.blockedScope).toBe(BudgetScope.FEATURE);
    // Org budget must show zero usage — the earlier reservation was rolled back.
    expect(engine.getBudget(BudgetScope.ORGANIZATION, 'org1')!.usedUsd).toBe(0);
  });
});

describe('BudgetEngine — safe defaults', () => {
  it('never allows fully unlimited spend: materializes a safe-default org budget when nothing is configured', () => {
    const engine = new BudgetEngine();
    expect(engine.getBudget(BudgetScope.ORGANIZATION, 'fresh-org')).toBeUndefined();

    const result = engine.reserveAcrossScopes([{ scope: BudgetScope.ORGANIZATION, scopeRef: 'fresh-org' }], 1);

    expect(result.ok).toBe(true);
    const budget = engine.getBudget(BudgetScope.ORGANIZATION, 'fresh-org');
    expect(budget).toBeDefined();
    expect(Number.isFinite(budget!.limitUsd)).toBe(true);
    expect(budget!.limitUsd).toBeGreaterThan(0);
  });
});
