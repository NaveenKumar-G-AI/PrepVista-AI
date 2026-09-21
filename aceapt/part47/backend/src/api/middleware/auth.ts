import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

/**
 * INTEGRATION NOTE (read this before wiring into ACEAPT):
 *
 * ACEAPT already has real authentication. This file is a STUB that exists
 * purely so Feature 47 is runnable and testable standalone, per the
 * "no existing codebase was provided" constraint this module was built
 * under. Replace `requireAuth` with a call into ACEAPT's real session/JWT
 * verification, and delete src/api/routes/dev.routes.ts (the token-issuing
 * route) entirely - it is gated behind `env.enableDevRoutes` and refuses to
 * mount when NODE_ENV=production, but it should not exist at all in the
 * integrated version.
 *
 * What this stub actually does: verifies a bearer JWT signed with
 * AUTH_STUB_SECRET, expects `{ sub: studentId }` as the payload, and sets
 * `req.studentId`. Every route below this middleware treats `req.studentId`
 * as the authenticated caller's identity - never a value taken from the
 * request body or query string (Section 94).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Missing bearer token.' });
    return;
  }
  try {
    const payload = jwt.verify(header.slice('Bearer '.length), env.authStubSecret) as { sub?: string };
    if (!payload.sub) {
      res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Token missing subject.' });
      return;
    }
    req.studentId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Invalid or expired token.' });
  }
}

export function signDevToken(studentId: string): string {
  return jwt.sign({ sub: studentId }, env.authStubSecret, { expiresIn: '12h' });
}
