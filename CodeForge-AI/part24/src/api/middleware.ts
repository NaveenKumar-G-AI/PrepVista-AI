import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = randomUUID();
  (req as Request & { correlationId?: string }).correlationId = id;
  res.setHeader('x-correlation-id', id);
  next();
}

/**
 * Placeholder auth: reads a plain user-id header. THIS MUST BE REPLACED with
 * real Supabase JWT verification when wired into the actual CodeForge
 * repository — it exists only so the routes below have something concrete
 * to authorize against while running standalone.
 */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const userId = req.header('x-user-id');
  if (!userId) {
    return res.status(401).json({ error: 'missing x-user-id header (stub auth — replace with real Supabase auth verification)' });
  }
  (req as Request & { userId?: string }).userId = userId;
  next();
}

/**
 * Express 4 does not forward rejected promises from async route handlers to
 * error middleware on its own — left unhandled, Node 18+ terminates the
 * process on an unhandled rejection. Every async route below is wrapped with
 * this so a thrown/rejected error becomes a normal 500 response instead of
 * taking the whole service down.
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

interface Bucket {
  tokens: number;
  last: number;
}
const buckets = new Map<string, Bucket>();

/**
 * In-memory token bucket, keyed per user+route. Swap `buckets` for a Redis
 * client in production — the refill/consume logic doesn't need to change,
 * only where state is stored, which is exactly the "reuse existing rate
 * limiting infrastructure" seam the spec asks for.
 */
export function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as Request & { userId?: string }).userId;
    const key = `${userId ?? req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: limit, last: now };
    const elapsed = now - bucket.last;
    const refill = (elapsed / windowMs) * limit;
    bucket.tokens = Math.min(limit, bucket.tokens + refill);
    bucket.last = now;

    if (bucket.tokens < 1) {
      buckets.set(key, bucket);
      return res.status(429).json({ error: 'rate limit exceeded, try again shortly' });
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    next();
  };
}
