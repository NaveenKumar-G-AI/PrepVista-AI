// ============================================================================
// Rate limiting (Section 44)
// ============================================================================
// Section 44: "Reuse existing rate-limit infrastructure." This file defines
// the interface the coach needs and a minimal in-memory reference
// implementation for local dev/tests only — swap InMemoryRateLimiter for
// your project's real (likely Redis-backed, multi-instance-safe) limiter in
// production. Do not deploy InMemoryRateLimiter as-is behind more than one
// server process; its state is process-local.
// ============================================================================

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitDecision> | RateLimitDecision;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  check(key: string): RateLimitDecision {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      if (this.limit <= 0) {
        this.buckets.set(key, { count: 0, windowStart: now });
        return { allowed: false, remaining: 0, retryAfterMs: this.windowMs };
      }
      this.buckets.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.limit - 1 };
    }

    if (bucket.count >= this.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: this.windowMs - (now - bucket.windowStart) };
    }

    bucket.count += 1;
    return { allowed: true, remaining: this.limit - bucket.count };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

/** Starting points — align with your project's existing limits for similar AI-backed endpoints. */
export const DEFAULT_GUIDANCE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };
export const DEFAULT_EVENT_RATE_LIMIT = { limit: 120, windowMs: 60_000 };
