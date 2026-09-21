import type { ReadinessResult } from '../domain/types';
import type { SnapshotRepository, VersionedSnapshot } from '../ports';

export class ConcurrencyConflictError extends Error {
  constructor(studentId: string, roleId: string) {
    super(`Concurrent update conflict for student=${studentId} role=${roleId} after max retries`);
    this.name = 'ConcurrencyConflictError';
  }
}

/**
 * Optimistic-concurrency-safe snapshot upsert (Phase 29): read current
 * version, compute a new result, attempt a compare-and-swap write, retry on
 * conflict. This is exactly the pattern that prevents the "challenge result
 * and debugging result arrive at nearly the same moment" race from Phase 29
 * — whichever write loses the CAS simply recomputes against the now-current
 * snapshot and retries, so no update is silently lost.
 *
 * This same shape maps directly onto a real Postgres/Supabase
 * `UPDATE ... WHERE version = $expected RETURNING *` — swap the in-memory
 * SnapshotRepository fixture in tests/fixtures for a real one and the
 * calling code here does not change.
 */
export async function upsertSnapshotWithRetry(
  repo: SnapshotRepository,
  studentId: string,
  roleId: string,
  computeFn: (previous: VersionedSnapshot | null) => ReadinessResult,
  maxRetries = 3,
): Promise<VersionedSnapshot> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const previous = await repo.getCurrentSnapshot(studentId, roleId);
    const expectedVersion = previous ? previous.version : null;
    const result = computeFn(previous);
    const saved = await repo.saveIfVersion(studentId, roleId, expectedVersion, result);
    if (saved) {
      await repo.appendHistory(result);
      return saved;
    }
    // version conflict — another writer won the race; loop and retry against the new current state
  }
  throw new ConcurrencyConflictError(studentId, roleId);
}
