import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * DEV-ONLY AUTH: this environment has no real identity provider to wire up
 * (no Supabase project, no OAuth). This is a minimal HMAC-signed session
 * token so the *authorization pattern* the brief requires can be genuinely
 * demonstrated: every protected route below derives studentId from this
 * verified token, NEVER from req.params/req.body — that is the actual
 * security property (Phase 42/50), and it's real here even though the login
 * step itself is a stand-in for what would be Supabase Auth / OAuth in
 * production. See docs/SECURITY.md.
 */

const SECRET = process.env.AUTH_SECRET || 'dev-only-insecure-secret-change-in-production';

export function signToken(studentId: string, role: 'STUDENT' | 'TPO_ADMIN' = 'STUDENT'): string {
  const payload = Buffer.from(JSON.stringify({ studentId, role, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { studentId: string; role: string } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (typeof data.studentId !== 'string' || typeof data.role !== 'string') return null;
    return { studentId: data.studentId, role: data.role };
  } catch {
    return null;
  }
}

export interface AuthedRequest extends Request {
  auth?: { studentId: string; role: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'missing bearer token' });
  const auth = verifyToken(header.slice(7));
  if (!auth) return res.status(401).json({ error: 'invalid or expired token' });
  req.auth = auth;
  next();
}

export function requireRole(role: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (req.auth?.role !== role) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
