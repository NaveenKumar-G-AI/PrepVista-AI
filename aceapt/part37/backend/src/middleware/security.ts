import { NextFunction, Request, Response } from 'express';

export interface AuthenticatedUser {
  /** The student/user id in ACEAPT's existing auth system. */
  id: string;
  tenantId: string;
  /** e.g. ['STUDENT'], ['TRAINER'], ['TPO'], ['ADMIN']. */
  roles: string[];
  /** Explicit, narrow grants — e.g. ['VIEW_STUDENT_EVIDENCE']. Absent/empty by default. */
  permissions?: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const PERMISSIONS = {
  /** Lets a non-owner (TPO, trainer, admin tooling) read a student's evidence/readiness. */
  VIEW_STUDENT_EVIDENCE: 'VIEW_STUDENT_EVIDENCE',
  /** Lets a non-owner (an ingestion service, an admin correction tool) write evidence on a student's behalf. */
  WRITE_STUDENT_EVIDENCE: 'WRITE_STUDENT_EVIDENCE',
} as const;

/**
 * This does NOT implement authentication itself — it assumes your existing
 * ACEAPT auth middleware runs earlier in the request chain and populates
 * `req.user`. Mount Feature 37's router AFTER that middleware. This only
 * enforces that someone is, in fact, authenticated before any Feature 37
 * route runs.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication is required.' });
    return;
  }
  next();
}

/**
 * A student's evidence must never become visible to (or writable by) a TPO,
 * trainer, or employer unless a specific permission says otherwise (brief,
 * section 41). This allows the request through when the authenticated user
 * IS the student in question, or when they hold the named permission —
 * nothing else.
 */
export function requireSelfOrPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication is required.' });
      return;
    }
    if (user.id === req.params.studentId) {
      next();
      return;
    }
    if (user.permissions?.includes(permission)) {
      next();
      return;
    }
    res.status(403).json({ error: 'FORBIDDEN', message: "You do not have permission to access this student's data." });
  };
}
