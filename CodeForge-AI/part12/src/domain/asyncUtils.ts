/**
 * CodeForge AI — Submission System
 * Tiny async primitives. In production (real Postgres), atomicity comes from row locks
 * and transactions, not from these — this file exists so the in-memory test double can
 * faithfully reproduce that atomicity instead of accidentally passing tests just because
 * Node is single-threaded. See inMemorySubmissionRepository.ts for how it's used.
 */

/** Promise-chaining mutex. Callers queue; each runs only after the previous finishes. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  async runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const runPromise = this.tail.then(() => fn());
    this.tail = runPromise.then(
      () => undefined,
      () => undefined,
    );
    return runPromise;
  }
}

export class KeyedMutexRegistry {
  private mutexes = new Map<string, Mutex>();

  get(key: string): Mutex {
    let m = this.mutexes.get(key);
    if (!m) {
      m = new Mutex();
      this.mutexes.set(key, m);
    }
    return m;
  }
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
