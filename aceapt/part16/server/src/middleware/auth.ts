import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Placeholder auth middleware. This is NOT a full authentication system —
 * Feature 16 doesn't own login/session issuance. It exists to demonstrate
 * and enforce the one hard requirement in Section 41: a request scoped to
 * one student can never read or write another student's data.
 *
 * Replace this with your existing auth middleware (Section 41: "follow
 * existing authentication and authorization"). Whatever you use, keep the
 * same guarantee this enforces: `req.studentId` must be trusted, and every
 * route handler must compare it against any studentId in the URL/body.
 *
 * Dev mode (no JWT_SECRET set): trusts the `x-student-id` header as-is.
 * This is intentionally insecure and clearly logged as such — it exists so
 * the prototype runs with the keys left blank, per the build instructions.
 * Once JWT_SECRET is set, requests must also include a matching
 * `Authorization: Bearer <hmac>` token (hmac = HMAC-SHA256 of the student id).
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      studentId?: string;
    }
  }
}

let warnedDevMode = false;

export function signStudentToken(studentId: string): string {
  if (!config.jwtSecret) return '';
  return crypto.createHmac('sha256', config.jwtSecret).update(studentId).digest('hex');
}

export function requireStudentAuth(req: Request, res: Response, next: NextFunction): void {
  const headerStudentId = req.header('x-student-id');
  if (!headerStudentId) {
    res.status(401).json({ error: 'Missing x-student-id header.' });
    return;
  }

  if (config.jwtSecret) {
    const authHeader = req.header('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const expected = signStudentToken(headerStudentId);
    if (!token || token !== expected) {
      res.status(401).json({ error: 'Invalid or missing token for this student.' });
      return;
    }
  } else if (!warnedDevMode) {
    warnedDevMode = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[auth] JWT_SECRET is blank — running in dev mode, trusting x-student-id as-is. Set JWT_SECRET before any real deployment.'
    );
  }

  req.studentId = headerStudentId;
  next();
}

/** Rejects a request if the studentId implied by the URL/body doesn't match the authenticated student. */
export function assertOwnsStudentId(req: Request, res: Response, candidateStudentId: string | undefined): boolean {
  if (!candidateStudentId || candidateStudentId !== req.studentId) {
    res.status(403).json({ error: "Cannot access another student's data." });
    return false;
  }
  return true;
}
