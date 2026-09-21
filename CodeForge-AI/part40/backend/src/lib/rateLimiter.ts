/**
 * RATE LIMITING
 * -----------------------------------------------------------------------
 * Fixed-window counter behind a `RateLimitStore` interface. The default
 * store is in-process memory, which is fine for a single instance / for
 * tests, but will under-count across multiple API replicas. Swap in a
 * Redis-backed RateLimitStore (INCR + EXPIRE / a Lua script) for a real
 * multi-instance deployment — the interface is the integration point, so
 * nothing above this layer needs to change. This mirrors "use the
 * existing rate-limiting infrastructure when available" from the brief:
 * if CodeForge already has a Redis-backed limiter, implement this
 * interface against it instead of using MemoryRateLimitStore.
 */

export interface RateLimitStore {
  /** Increments the counter for `key` and returns the new count, creating the window if needed. */
  incrementAndGet(key: string, windowMs: number): Promise<number>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAtMs: number }>();

  async incrementAndGet(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const existing = this.windows.get(key);
    if (!existing || existing.resetAtMs <= now) {
      this.windows.set(key, { count: 1, resetAtMs: now + windowMs });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  /** Test/ops helper — not part of the interface. */
  reset() {
    this.windows.clear();
  }
}

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  limit: number;
}

export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  async check(key: string): Promise<RateLimitDecision> {
    const count = await this.store.incrementAndGet(key, this.windowMs);
    return { allowed: count <= this.limit, count, limit: this.limit };
  }
}
