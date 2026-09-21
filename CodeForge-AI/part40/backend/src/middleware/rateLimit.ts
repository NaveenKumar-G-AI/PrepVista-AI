import type { Request, Response, NextFunction } from "express";
import { MemoryRateLimitStore, RateLimiter, type RateLimitStore } from "../lib/rateLimiter";
import { emitSecurityEvent } from "../security/securityEvents.service";

/**
 * RATE LIMITING (RATE_LIMIT_EXCEEDED feeds abuseDetection.ts / alertEngine.ts)
 * -----------------------------------------------------------------------
 * `keyFn` decides what's being limited together — per-IP for
 * unauthenticated endpoints (login), per-user for authenticated ones
 * (admin APIs, audit queries), or a composite. Swap `sharedStore` for a
 * Redis-backed RateLimitStore in a multi-instance deployment (see
 * lib/rateLimiter.ts) — everything else here is unaffected.
 */

const sharedStore: RateLimitStore = new MemoryRateLimitStore();

export function rateLimit(opts: { limit: number; windowMs: number; keyFn: (req: Request) => string; label: string }) {
  const limiter = new RateLimiter(sharedStore, opts.limit, opts.windowMs);

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${opts.label}:${opts.keyFn(req)}`;
    const decision = await limiter.check(key);

    res.setHeader("X-RateLimit-Limit", String(decision.limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, decision.limit - decision.count)));

    if (!decision.allowed) {
      await emitSecurityEvent({
        eventType: "RATE_LIMIT_EXCEEDED",
        actorUserId: req.identity?.userId ?? null,
        actorRole: req.identity?.role ?? null,
        organizationId: req.identity?.organizationId ?? null,
        resourceType: opts.label,
        result: "DENIED",
        correlationId: req.correlationId,
        ipAddress: req.ip,
        metadata: { limit: decision.limit, count: decision.count }
      });
      return res.status(429).json({ error: "rate_limited", message: "Too many requests. Please slow down." });
    }

    next();
  };
}

export function byIp(req: Request): string {
  return req.ip ?? "unknown-ip";
}

export function byUser(req: Request): string {
  return req.identity?.userId ?? byIp(req);
}
