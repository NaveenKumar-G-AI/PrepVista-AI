import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { ZodSchema } from "zod";
import { config } from "../config";
import { AuthedUser } from "../domain/types";
import { Role } from "../domain/enums";
import { NoQuestionAvailableError, SessionNotFoundError, SessionNotOwnedError } from "../services/practiceOrchestrator";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/** §42 — every route that touches student data requires a verified JWT. There is no
 * "trust the studentId in the request body" path anywhere in this API. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token." });
  }
  try {
    const payload = jwt.verify(header.slice("Bearer ".length), config.jwtSecret) as AuthedUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: `Requires ${role} role.` });
    }
    next();
  };
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Invalid request body.", issues: result.error.issues });
    }
    req.body = result.data;
    next();
  };
}

/** Attempt submission and AI-generation-triggering endpoints get a tighter limit — everything else the default. */
export const attemptRateLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
export const defaultRateLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false });

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  // eslint-disable-next-line no-console
  console.error(`[error] ${req.method} ${req.path}:`, err);
  const message = err instanceof Error ? err.message : "Unexpected error.";
  let status = 400;
  if (err instanceof SessionNotFoundError) status = 404;
  else if (err instanceof SessionNotOwnedError) status = 403;
  else if (err instanceof NoQuestionAvailableError) status = 503;
  res.status(status).json({ error: message });
}
