import { NextFunction, Request, Response } from 'express';
import { AuthContext, Role } from '../types';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * DEV-ONLY STUB. Reads auth context from headers instead of verifying a
 * real session/JWT. Replace with your actual authentication middleware
 * before this touches real traffic - see docs/INTEGRATION.md. Left this way
 * on purpose rather than faking a "real-looking" JWT check that would be
 * actively misleading about its own security.
 */
export function attachAuthContext(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.header('x-user-id');
  const role = req.header('x-user-role') as Role | undefined;
  const tenantId = req.header('x-tenant-id') ?? undefined;
  if (userId && role) {
    req.auth = { userId, role, tenantId };
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: `Requires one of: ${roles.join(', ')}.` });
      return;
    }
    next();
  };
}

/** A student may only act on their own records unless they hold a staff role. */
export function requireSelfOrRole(paramName: string, ...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const rawTargetId = req.params[paramName];
    const targetId = Array.isArray(rawTargetId) ? rawTargetId[0] : rawTargetId;
    if (req.auth.userId === targetId || roles.includes(req.auth.role)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Not authorized for this student.' });
  };
}
