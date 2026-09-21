/**
 * CodeForge AI — Submission System
 * Generic token-bucket rate limiter. Deliberately doesn't know what a "user" or
 * "assessment" is — the caller composes the key (`user:${userId}`,
 * `assessment:${assessmentId}:user:${userId}`, `ip:${ip}`), so one limiter instance can
 * back every axis the spec asks for (user, IP, assessment, problem, time window)
 * without duplicated logic per axis. `now` is an explicit parameter so tests are
 * deterministic and don't depend on real wall-clock timing.
 */

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

export class TokenBucketRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillIntervalMs: number,
    private readonly refillAmount: number = 1,
  ) {
    if (capacity <= 0 || refillIntervalMs <= 0 || refillAmount <= 0) {
      throw new Error('TokenBucketRateLimiter requires positive capacity, refillIntervalMs, and refillAmount');
    }
  }

  /** True if the request is allowed (and consumes a token); false if rate-limited. */
  tryConsume(key: string, now: number = Date.now(), cost = 1): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, lastRefillAt: now };

    const elapsed = now - bucket.lastRefillAt;
    if (elapsed > 0) {
      const refills = Math.floor(elapsed / this.refillIntervalMs);
      if (refills > 0) {
        bucket.tokens = Math.min(this.capacity, bucket.tokens + refills * this.refillAmount);
        bucket.lastRefillAt += refills * this.refillIntervalMs;
      }
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      this.buckets.set(key, bucket);
      return true;
    }
    this.buckets.set(key, bucket);
    return false;
  }

  remaining(key: string, now: number = Date.now()): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.capacity;
    const elapsed = now - bucket.lastRefillAt;
    const refills = Math.floor(elapsed / this.refillIntervalMs);
    return Math.min(this.capacity, bucket.tokens + refills * this.refillAmount);
  }
}

/** Convenience factory matching AppConfig.rateLimit — one bucket per axis, per-minute windows. */
export function buildSubmissionRateLimiters(cfg: { submissionsPerUserPerMinute: number; submissionsPerIpPerMinute: number }) {
  return {
    perUser: new TokenBucketRateLimiter(cfg.submissionsPerUserPerMinute, 60_000 / cfg.submissionsPerUserPerMinute, 1),
    perIp: new TokenBucketRateLimiter(cfg.submissionsPerIpPerMinute, 60_000 / cfg.submissionsPerIpPerMinute, 1),
  };
}
