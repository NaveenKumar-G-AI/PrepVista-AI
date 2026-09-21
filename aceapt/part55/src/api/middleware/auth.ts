import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type Role = 'ADMIN' | 'STUDENT';

export interface AuthContext {
  tenantId: string;
  role: Role;
  userId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * TODO(integration): replace with ACEAPT's real session/JWT verification.
 * This exists only so the reference implementation has *something* enforcing
 * tenant + role before it reaches a service, matching §153-157 (tenant
 * isolation, role-gated access to internal evidence). It intentionally does
 * as little as possible: read a token, verify it, attach { tenantId, role,
 * userId } to the request. In non-production environments it also accepts
 * plain x-tenant-id/x-role/x-user-id headers so the reference implementation
 * and its tests don't need a real JWT-issuing login flow — that header path
 * is hard-disabled whenever NODE_ENV === 'production'.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      const secret = process.env.AUTH_JWT_SECRET;
      if (!secret) throw new Error('AUTH_JWT_SECRET not configured');
      const payload = jwt.verify(token, secret) as Partial<AuthContext>;
      if (!payload.tenantId || !payload.role || !payload.userId) {
        res.status(401).json({ error: 'Token missing required claims' });
        return;
      }
      req.auth = { tenantId: payload.tenantId, role: payload.role, userId: payload.userId };
      next();
      return;
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const tenantId = req.header('x-tenant-id');
    const role = req.header('x-role') as Role | undefined;
    const userId = req.header('x-user-id');
    if (tenantId && role && userId) {
      req.auth = { tenantId, role, userId };
      next();
      return;
    }
  }

  res.status(401).json({ error: 'Authentication required' });
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowed.includes(req.auth.role)) {
      // §156-157: a student must never reach admin evidence endpoints, full
      // stop — this is the second layer behind the DB-level column/RLS
      // protection, not a substitute for it.
      res.status(403).json({ error: 'Insufficient role for this endpoint' });
      return;
    }
    next();
  };
}
