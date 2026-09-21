import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import type { AuthContext } from '../../domain/types';

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

/**
 * Authenticates the caller and attaches { studentId, tenantId, role } to
 * the request. Real JWTs are verified against JWT_SECRET (blank by
 * default - see .env.example). Until you set a secret, a dev-only fallback
 * reads plain x-dev-* headers so you can exercise the API locally; that
 * fallback refuses to run once NODE_ENV=production, so this can't
 * accidentally ship open.
 */
export function authenticate(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.header('authorization');

  if (header?.startsWith('Bearer ') && env.JWT_SECRET) {
    try {
      const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as Partial<AuthContext>;
      if (!payload.studentId) throw new Error('token missing studentId');
      req.auth = {
        studentId: payload.studentId,
        tenantId: payload.tenantId || env.DEFAULT_TENANT_ID,
        role: payload.role || 'STUDENT',
      };
      next();
      return;
    } catch {
      res.status(401).json({ error: 'Invalid or expired token.' });
      return;
    }
  }

  if (env.ALLOW_DEV_AUTH && env.NODE_ENV !== 'production') {
    const studentId = req.header('x-dev-student-id');
    if (studentId) {
      req.auth = {
        studentId,
        tenantId: req.header('x-dev-tenant-id') || env.DEFAULT_TENANT_ID,
        role: (req.header('x-dev-role') as AuthContext['role']) || 'STUDENT',
      };
      next();
      return;
    }
  }

  res.status(401).json({
    error:
      'Authentication required. Configure JWT_SECRET for real tokens, or (development only) send an x-dev-student-id header.',
  });
}

export function requireRole(...roles: AuthContext['role'][]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}
