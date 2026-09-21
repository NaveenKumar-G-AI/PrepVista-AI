import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-in-production';

export interface AuthedRequest extends Request {
  studentId?: string;
}

export function signDemoToken(studentId: string): string {
  return jwt.sign({ sub: studentId }, JWT_SECRET, { expiresIn: '12h' });
}

/**
 * Derives the authenticated student's id from a verified JWT — NEVER from
 * req.body.studentId / req.query.studentId (Phase 50). Every route handler
 * downstream reads `req.studentId`, which only this middleware sets.
 *
 * This demo issues its own JWTs via POST /api/auth/demo-login for the
 * seeded demo students, which is intentionally simple/insecure (see
 * CODEFORGE_SECURITY.md) — in a real deployment this middleware would verify
 * a Supabase-issued JWT instead. The pattern it enforces (identity from a
 * verified token, ownership-filtered queries everywhere) is the real
 * production pattern regardless of which auth provider issues the token.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <token> header' });
    return;
  }
  try {
    const payload = jwt.verify(header.slice('Bearer '.length), JWT_SECRET) as { sub: string };
    req.studentId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
