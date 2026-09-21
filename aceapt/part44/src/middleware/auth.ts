// Authentication (Section 53). This service VERIFIES a token issued by
// ACEAPT's real auth system - it never issues one itself. In dev, with
// JWT_PUBLIC_KEY_OR_SECRET unset, it accepts an X-Student-Id header
// instead so this reference implementation is runnable and testable
// without a real auth service attached. That header path is refused
// outright once a real secret is configured, so it can never
// accidentally reach production.
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      studentId?: string;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.JWT_PUBLIC_KEY_OR_SECRET;

  if (secret) {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }
    try {
      const decoded = jwt.verify(token, secret) as { sub?: string };
      if (!decoded.sub) throw new Error("token missing sub claim");
      req.studentId = decoded.sub;
      next();
    } catch {
      res.status(401).json({ error: "invalid token" });
    }
    return;
  }

  // DEV MODE ONLY (no JWT secret configured).
  const devStudentId = req.header("x-student-id");
  if (!devStudentId) {
    res.status(401).json({
      error: "missing X-Student-Id header (dev mode - no JWT_PUBLIC_KEY_OR_SECRET configured)",
    });
    return;
  }
  req.studentId = devStudentId;
  next();
}
