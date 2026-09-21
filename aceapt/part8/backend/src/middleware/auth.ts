import type { Request, Response, NextFunction } from "express";
import { verifyAuthToken } from "../lib/jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { studentId: string; email: string };
    }
  }
}

/**
 * Every route past this middleware has req.auth.studentId available, which
 * is the ONLY source of truth for "which student is this" - route handlers
 * must never trust a studentId from the request body/params for anything
 * that touches student-scoped data (spec section 51: "student ownership
 * validation... never modify mastery state/score/evidence through client-
 * side manipulation"). Combined with the RLS layer (see lib/db.ts), this
 * means even a route handler bug that forgot an ownership check still can't
 * leak another student's rows - it would just see zero rows.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header." });
    return;
  }
  try {
    const payload = verifyAuthToken(header.slice("Bearer ".length));
    req.auth = { studentId: payload.studentId, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}
