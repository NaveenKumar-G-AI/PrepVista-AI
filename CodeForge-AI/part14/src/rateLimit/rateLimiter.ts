import { createHash } from "node:crypto";

export interface RateLimitStore {
  /** Increments the counter for `key` within the current window and returns the new count. */
  increment(key: string, windowMs: number): Promise<number>;
}

/** Reference in-memory store. Swap for a Redis-backed RateLimitStore in a multi-instance deployment. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    bucket.count += 1;
    return bucket.count;
  }
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  constructor(
    private store: RateLimitStore,
    private config: RateLimitConfig
  ) {}

  async check(userId: string): Promise<{ allowed: boolean; count: number }> {
    const count = await this.store.increment(`coach:${userId}`, this.config.windowMs);
    return { allowed: count <= this.config.maxRequests, count };
  }
}

const recentRequestHashes = new Map<string, number>();

/** Suppresses an identical request (same session/mode/question/code) fired again within `withinMs`. */
export function isDuplicateRequest(hash: string, withinMs = 4000): boolean {
  const now = Date.now();
  const last = recentRequestHashes.get(hash);
  recentRequestHashes.set(hash, now);
  return last !== undefined && now - last < withinMs;
}

export function hashRequest(sessionId: string, mode: string, question: string | undefined, code: string): string {
  return createHash("sha1").update(`${sessionId}|${mode}|${question ?? ""}|${code}`).digest("hex");
}
