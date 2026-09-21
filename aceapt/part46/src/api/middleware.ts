import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthedRequest extends Request {
  studentId: string;
}

/**
 * Section 90: enforce authentication + student ownership. `dev` mode is a
 * clearly-marked stand-in for local testing only; `jwt` mode verifies a real
 * Bearer token. Wire your real identity provider in by replacing the `jwt`
 * branch (or adding a new AUTH_MODE) - controllers never need to change,
 * they only ever read (req as AuthedRequest).studentId.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (env.authMode === "dev") {
    const headerId = req.header("x-student-id");
    (req as AuthedRequest).studentId = headerId && headerId.trim() ? headerId.trim() : "demo-student";
    next();
    return;
  }

  const authHeader = req.header("authorization") || "";
  const [, token] = authHeader.split(" ");
  if (!token) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub?: string };
    if (!payload.sub) {
      res.status(401).json({ error: "token_missing_subject" });
      return;
    }
    (req as AuthedRequest).studentId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

const buckets = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

/** Simple in-memory fixed-window limiter (section 90/91). Good enough for a
 *  single instance; use a shared store (e.g. Redis) once you run more than one. */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = (req as AuthedRequest).studentId || req.ip || "anonymous";
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    next();
    return;
  }
  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({ error: "rate_limited", retryAfterMs: WINDOW_MS - (now - bucket.windowStart) });
    return;
  }
  next();
}
