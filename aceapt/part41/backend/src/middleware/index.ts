import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export interface AuthedRequest extends Request {
  studentId?: string;
}

/**
 * DEV-ONLY PLACEHOLDER. Reads a plain header instead of verifying a real
 * session/JWT. This is here so the routes are runnable and testable in
 * isolation — replace with ACEAPT's real auth middleware before this ever
 * sees real student data (spec #73: authentication, #77: human control).
 */
export function devAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const studentId = req.header('x-student-id');
  if (!studentId) {
    res.status(401).json({ error: 'Missing x-student-id header (placeholder auth — replace with real session/JWT verification).' });
    return;
  }
  req.studentId = studentId;
  next();
}

/** spec #73: student-level isolation. Confirms the :studentId in the route
 * matches the authenticated caller. */
export function enforceStudentIsolation(paramName = 'studentId') {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const paramId = req.params[paramName];
    if (paramId && paramId !== req.studentId) {
      res.status(403).json({ error: 'Forbidden: student scope mismatch.' });
      return;
    }
    next();
  };
}

/** spec #73: rate limiting. Simple in-memory fixed-window limiter — swap for
 * a shared-store (Redis) limiter in a multi-instance deployment. */
const windowStart = new Map<string, number>();
const windowCount = new Map<string, number>();
const WINDOW_MS = 60_000;

export function rateLimit(req: AuthedRequest, res: Response, next: NextFunction): void {
  const key = req.studentId ?? req.ip ?? 'unknown';
  const now = Date.now();
  const start = windowStart.get(key) ?? 0;
  if (now - start > WINDOW_MS) {
    windowStart.set(key, now);
    windowCount.set(key, 0);
  }
  const count = (windowCount.get(key) ?? 0) + 1;
  windowCount.set(key, count);
  if (count > env.rateLimitPerMinute) {
    res.status(429).json({ error: 'Rate limit exceeded.' });
    return;
  }
  next();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (env.verboseLogging || !env.isProd) console.error(err);
  res.status(500).json({ error: env.isProd ? 'Internal error.' : message });
}
