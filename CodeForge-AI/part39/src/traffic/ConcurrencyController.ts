interface Semaphore {
  limit: number;
  inFlight: number;
  waiters: Array<{ resolve: () => void; reject: (e: Error) => void; queuedAt: number }>;
}

export class ConcurrencyLimitExceededError extends Error {
  constructor(key: string) {
    super(`Concurrency queue for "${key}" is full`);
    this.name = 'ConcurrencyLimitExceededError';
  }
}

export interface AcquireHandle {
  release: () => void;
}

/**
 * Per-key semaphore (e.g. one per provider, or one per provider+model) so
 * a traffic spike is smoothed into "controlled provider traffic" instead
 * of an uncontrolled flood — this is the GOLDEN CONCURRENCY TEST from the
 * spec. Requests beyond the limit queue (FIFO) rather than failing
 * immediately, up to `maxQueueSize`; beyond that they fail fast rather
 * than growing an unbounded queue.
 */
export class ConcurrencyController {
  private semaphores = new Map<string, Semaphore>();

  private getSemaphore(key: string, limit: number): Semaphore {
    let sem = this.semaphores.get(key);
    if (!sem) {
      sem = { limit, inFlight: 0, waiters: [] };
      this.semaphores.set(key, sem);
    }
    // A policy change can raise/lower the limit for an existing key at runtime.
    sem.limit = limit;
    return sem;
  }

  async acquire(key: string, limit: number, opts: { maxQueueSize?: number; queueTimeoutMs?: number } = {}): Promise<AcquireHandle> {
    const sem = this.getSemaphore(key, limit);
    const maxQueueSize = opts.maxQueueSize ?? limit * 5;

    if (sem.inFlight < sem.limit) {
      sem.inFlight++;
      return { release: () => this.release(key) };
    }

    if (sem.waiters.length >= maxQueueSize) {
      throw new ConcurrencyLimitExceededError(key);
    }

    return new Promise<AcquireHandle>((resolve, reject) => {
      const waiter = {
        queuedAt: Date.now(),
        resolve: () => resolve({ release: () => this.release(key) }),
        reject,
      };
      sem.waiters.push(waiter);

      if (opts.queueTimeoutMs) {
        setTimeout(() => {
          const idx = sem.waiters.indexOf(waiter);
          if (idx !== -1) {
            sem.waiters.splice(idx, 1);
            reject(new Error(`Timed out waiting for AI concurrency slot on "${key}"`));
          }
        }, opts.queueTimeoutMs);
      }
    });
  }

  private release(key: string): void {
    const sem = this.semaphores.get(key);
    if (!sem) return;
    const next = sem.waiters.shift();
    if (next) {
      next.resolve();
    } else {
      sem.inFlight = Math.max(0, sem.inFlight - 1);
    }
  }

  snapshot(key: string): { inFlight: number; queued: number; limit: number } | undefined {
    const sem = this.semaphores.get(key);
    if (!sem) return undefined;
    return { inFlight: sem.inFlight, queued: sem.waiters.length, limit: sem.limit };
  }
}

export const concurrencyController = new ConcurrencyController();
