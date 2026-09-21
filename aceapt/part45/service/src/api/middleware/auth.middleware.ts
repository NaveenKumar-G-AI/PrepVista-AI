import type { NextFunction, Request, Response } from 'express';

// ---------------------------------------------------------------------------
// THIS IS A STUB. There is no real ACEAPT auth system to integrate against
// in this build. It exists only so ownership checks (section 61: "Student A
// must never retrieve Student B's personal graph") and role checks are
// actually enforced and testable end to end today, instead of being an
// unverified promise.
//
// Expected header: "Authorization: Bearer <userId>:<role>[:<institutionId>]"
// role is one of: student | admin | institution_viewer
//
// Replace this file's `parseAuthHeader` with real JWT/session verification
// before deploying. Nothing downstream (requireAuth/requireSelfOrRole/
// requireRole) needs to change — they only read req.user.
// ---------------------------------------------------------------------------

export type Role = 'student' | 'admin' | 'institution_viewer';

export interface AuthUser {
  id: string;
  role: Role;
  institutionId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function parseAuthHeader(header: string | undefined): AuthUser | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  const parts = token.split(':');
  const [id, role, institutionId] = parts;
  if (!id || !role) return null;
  if (role !== 'student' && role !== 'admin' && role !== 'institution_viewer') return null;
  return { id, role, institutionId };
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.user = parseAuthHeader(req.header('authorization')) ?? undefined;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Missing or invalid Authorization header.' });
  }
  next();
}

/** For /students/:studentId/... routes: the student themself, or an allowed elevated role. */
export function requireSelfOrRole(paramName: string, ...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }
    const targetId = req.params[paramName];
    const isSelf = req.user.role === 'student' && req.user.id === targetId;
    const hasRole = roles.includes(req.user.role);
    if (!isSelf && !hasRole) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have access to this student\'s data.' });
    }
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: `Requires role: ${roles.join(' or ')}.` });
    }
    next();
  };
}

/** For /institutions/:institutionId/... routes: institution_viewer/admin scoped to their own institution. */
export function requireInstitutionMatch(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (req.user.role === 'admin') return next(); // platform admins can cross institutions
    const targetInstitution = req.params[paramName];
    if (req.user.role !== 'institution_viewer' || req.user.institutionId !== targetInstitution) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not authorized for this institution.' });
    }
    next();
  };
}
