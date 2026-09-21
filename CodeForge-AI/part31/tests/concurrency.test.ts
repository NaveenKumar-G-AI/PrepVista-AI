import { describe, expect, it } from 'vitest';
import { upsertSnapshotWithRetry } from '../src/persistence/concurrency';
import { makeInMemorySnapshotRepository } from './fixtures/inMemoryAdapters';
import { BACKEND_DEVELOPER_ROLE, NOW } from './fixtures/roleModels';
import { computeRoleReadiness } from '../src/domain/readinessEngine';
import type { ReadinessResult } from '../src/domain/types';

/** A ReadinessResult stand-in with a distinguishing score — the concurrency
 * mechanism under test doesn't care about calculation internals, only about
 * whether writes are correctly accepted/rejected/retried. */
function resultWithScore(readinessScore: number): ReadinessResult {
  const base = computeRoleReadiness({
    studentId: 's1',
    organizationId: 'org1',
    roleModel: BACKEND_DEVELOPER_ROLE,
    evidence: [],
    now: NOW,
  });
  return { ...base, readinessScore };
}

describe('upsertSnapshotWithRetry', () => {
  it('rejects a stale compare-and-swap write once another writer has already advanced the version', async () => {
    const repo = makeInMemorySnapshotRepository();

    // "Process A" (e.g. a challenge result) writes first, from version null -> 1.
    const savedA = await repo.saveIfVersion('s1', 'role_backend_dev', null, resultWithScore(10));
    expect(savedA?.version).toBe(1);

    // "Process B" (e.g. a debugging result), computed against the SAME stale
    // expectedVersion (null) because it read the snapshot before A wrote —
    // this must be rejected, not silently overwrite A's update.
    const staleWrite = await repo.saveIfVersion('s1', 'role_backend_dev', null, resultWithScore(20));
    expect(staleWrite).toBeNull();
  });

  it('recovers from a conflict via retry and converges to a consistent final state with no lost update', async () => {
    const repo = makeInMemorySnapshotRepository();
    let computeCallCount = 0;

    // Seed a conflict exactly like the test above: someone else wrote version 1
    // out from under us before our retry loop even starts.
    await repo.saveIfVersion('s1', 'role_backend_dev', null, resultWithScore(10));

    const computeFn = () => {
      computeCallCount += 1;
      return resultWithScore(30);
    };

    const final = await upsertSnapshotWithRetry(repo, 's1', 'role_backend_dev', computeFn);

    expect(final.version).toBe(2); // advanced from 1 -> 2, not lost or overwritten in place
    expect(final.result.readinessScore).toBe(30);
    expect(computeCallCount).toBe(1); // first attempt sees version 1 as current and succeeds directly
    const history = await repo.getHistory('s1', 'role_backend_dev');
    expect(history).toHaveLength(1); // only the successful write is appended to history
  });

  it('throws ConcurrencyConflictError after exhausting retries against a repo that never accepts the write', async () => {
    const repo = makeInMemorySnapshotRepository();
    const alwaysConflicting = { ...repo, saveIfVersion: async () => null };

    await expect(
      upsertSnapshotWithRetry(alwaysConflicting as typeof repo, 's1', 'role_backend_dev', () => resultWithScore(50), 2),
    ).rejects.toThrow(/Concurrent update conflict/);
  });
});
