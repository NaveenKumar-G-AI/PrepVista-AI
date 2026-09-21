/**
 * In-memory sliding-window rate limiter.
 *
 * This is intentionally simple and clearly documented as a stand-in: in
 * a real multi-instance deployment this state needs to live somewhere
 * shared (Redis/Upstash, or whatever the rest of CodeForge already uses
 * for rate limiting elsewhere — reuse that if it exists rather than this
 * file). The interface is deliberately small so swapping the backing
 * store later doesn't require touching call sites.
 */

export interface RateLimiter {
  /** Returns milliseconds to wait if rate-limited, or null if the request is allowed (and records it). */
  check(key: string): number | null;
}

export class InMemorySlidingWindowRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly windowMs: number, private readonly maxRequests: number) {}

  check(key: string): number | null {
    const now = Date.now();
    const existing = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);

    if (existing.length >= this.maxRequests) {
      const oldest = existing[0]!;
      this.hits.set(key, existing);
      return this.windowMs - (now - oldest);
    }

    existing.push(now);
    this.hits.set(key, existing);
    return null;
  }

  /** Test/ops helper — not used in the request path. */
  reset(key?: string) {
    if (key) this.hits.delete(key);
    else this.hits.clear();
  }
}

export function loadRateLimiterFromEnv(env: NodeJS.ProcessEnv = process.env): RateLimiter {
  const windowMs = Number.parseInt(env.HINT_LADDER_RATE_LIMIT_WINDOW_MS ?? "10000", 10);
  const maxRequests = Number.parseInt(env.HINT_LADDER_RATE_LIMIT_MAX_REQUESTS ?? "5", 10);
  return new InMemorySlidingWindowRateLimiter(windowMs, maxRequests);
}
