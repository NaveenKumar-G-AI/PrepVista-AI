/**
 * Auth middleware (§130, §187-189). This is a placeholder that reads a
 * pre-verified identity off the request — replace `verifyToken` with a real
 * call into ACEAPT's existing JWT/session verification. Nothing downstream
 * should change: everything else just reads `req.auth`.
 */
import type { NextFunction, Request, Response } from 'express';
import type { AuthContext, Role } from '../ports';
import { config } from '../config';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * PLACEHOLDER. Real ACEAPT auth almost certainly already verifies a JWT or
 * session and attaches (userId, tenantId, role) to the request — call that
 * here instead of this stub. This stub trusts three headers only so the
 * module is runnable/testable standalone; it must not be used as-is in
 * production.
 */
function verifyToken(req: Request): AuthContext | null {
  const userId = req.header('x-user-id');
  const tenantId = req.header('x-tenant-id');
  const role = req.header('x-user-role') as Role | undefined;
  if (!userId || !tenantId || !role) return null;
  if (!config.auth.jwtPublicKey) {
    // No real verifier configured yet — headers are trusted as-is for local
    // development only. Set JWT_PUBLIC_KEY and replace this function before
    // deploying anywhere real users can reach it.
  }
  return { userId, tenantId, role };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = verifyToken(req);
  if (!auth) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  req.auth = auth;
  next();
}

/**
 * §130: students may only access their own data; trainers/admins are scoped
 * by tenant. `studentIdParam` names the route param carrying the target
 * student id (e.g. "studentId").
 */
export function authorizeStudentResource(studentIdParam: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    const targetStudentId = req.params[studentIdParam];
    if (auth.role === 'student' && auth.userId !== targetStudentId) {
      res.status(403).json({ error: 'Students can only access their own decision data.' });
      return;
    }
    // Trainers/admins are further scoped to their own tenant via tenantId in
    // every repository call — see middleware/tenant handling in api/router.ts.
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: `Requires one of: ${roles.join(', ')}` });
      return;
    }
    next();
  };
}
