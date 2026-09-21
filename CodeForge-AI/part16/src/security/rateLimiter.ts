/**
 * Pluggable rate limiter. `InMemoryTokenBucketRateLimiter` is real and
 * works standalone, but the intent is that a host app with existing
 * rate-limiting infra (Redis/Upstash, an API gateway, etc.) implements
 * this same interface and the AI analysis endpoint reuses it, rather than
 * this engine inventing a second, competing rate-limiting system.
 */
export interface RateLimiter {
  /** Returns true if the call is allowed and consumes one unit of quota. */
  tryConsume(key: string): Promise<boolean>;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class InMemoryTokenBucketRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number, // tokens added per millisecond
    private readonly now: () => number = () => Date.now()
  ) {}

  async tryConsume(key: string): Promise<boolean> {
    const nowMs = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, lastRefillMs: nowMs };

    const elapsed = Math.max(0, nowMs - bucket.lastRefillMs);
    const refilled = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs);

    if (refilled < 1) {
      this.buckets.set(key, { tokens: refilled, lastRefillMs: nowMs });
      return false;
    }

    this.buckets.set(key, { tokens: refilled - 1, lastRefillMs: nowMs });
    return true;
  }
}
