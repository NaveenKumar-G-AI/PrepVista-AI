import type { NextFunction, Request, Response } from 'express';

export interface AuthedRequest extends Request {
  studentId?: string;
  isServiceRole?: boolean;
}

/**
 * INTEGRATION SEAM: replace this with your real auth. This stub only
 * reads a header so the rest of the API is runnable/testable standalone.
 * In production this must verify a real Supabase JWT (or your platform's
 * equivalent) — never trust a client-supplied student id directly.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const studentId = req.header('x-student-id');
  if (!studentId) {
    res.status(401).json({ error: 'Missing authentication. Wire this middleware to your real auth provider.' });
    return;
  }
  req.studentId = studentId;
  next();
}
