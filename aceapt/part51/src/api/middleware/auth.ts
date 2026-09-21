import type { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "../../errors.js";

export interface AuthedRequest extends Request {
  studentId?: string;
}

/**
 * §104 (answer-key/data protection) needs SOME auth boundary to mean
 * anything, but Feature 51 has no auth system of its own to reuse (§7 says
 * reuse existing auth — none exists in this standalone module). This
 * placeholder verifies a bearer token was presented and trusts the student
 * id encoded in it 1:1. Every service method below takes a plain studentId
 * string, not a request object, specifically so swapping this function's
 * body for real ACEAPT session/JWT verification is the ONLY change needed
 * to wire in real auth.
 */
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(new ForbiddenError("Missing bearer token"));
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    next(new ForbiddenError("Invalid token"));
    return;
  }
  // Dev/test placeholder: the token IS the student id. Replace with real verification.
  req.studentId = token;
  next();
}
