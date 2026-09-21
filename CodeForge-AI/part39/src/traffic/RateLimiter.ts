interface Bucket {
  tokens: number;
  capacity: number;
  refillPerMs: number;
  lastRefillAt: number;
}

/**
 * Per-key token bucket. One instance protects many independent keys
 * (e.g. "org:123", "feature:code-review", "global") — each gets its own
 * bucket, created lazily on first use so callers don't need to
 * pre-register every organization.
 *
 * In-memory and therefore per-process; a multi-instance deployment should
 * back this with Redis (INCR + PEXPIRE, or a Lua script for true token
 * bucket semantics) so limits are enforced across the whole fleet rather
 * than per-instance.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  private getBucket(key: string, capacity: number, refillPerMinute: number): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, capacity, refillPerMs: refillPerMinute / 60_000, lastRefillAt: Date.now() };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refill(bucket: Bucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefillAt;
    if (elapsed <= 0) return;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerMs);
    bucket.lastRefillAt = now;
  }

  /** capacity and refillPerMinute describe the limit for `key`; both are supplied by the caller's resolved policy, never hardcoded here. */
  tryConsume(key: string, capacity: number, refillPerMinute: number, cost = 1): { allowed: boolean; remaining: number } {
    const bucket = this.getBucket(key, capacity, refillPerMinute);
    this.refill(bucket);
    if (bucket.tokens < cost) {
      return { allowed: false, remaining: Math.floor(bucket.tokens) };
    }
    bucket.tokens -= cost;
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
  }

  snapshot(key: string): { tokens: number; capacity: number } | undefined {
    const bucket = this.buckets.get(key);
    if (!bucket) return undefined;
    this.refill(bucket);
    return { tokens: bucket.tokens, capacity: bucket.capacity };
  }
}

export const rateLimiter = new RateLimiter();
