import { Request, Response, NextFunction } from 'express';
import { AppRole } from '../../db';
import { AppError } from '../../types';

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: AppRole;
}

/**
 * STUB authentication — placeholder for real Supabase JWT verification.
 * Reads X-User-Id / X-User-Role headers so the API is exercisable end to
 * end. REPLACE with real JWT verification (Supabase `auth.getUser()` or
 * equivalent) before this ever sees real traffic; nothing downstream needs
 * to change since every service call already goes through
 * withUserContext(userId, role, ...).
 */
export function stubAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = req.header('X-User-Id');
  const userRole = req.header('X-User-Role') as AppRole | undefined;
  if (!userId || !userRole) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing X-User-Id / X-User-Role (stub auth — replace with real Supabase JWT verification before production)',
    });
  }
  req.userId = userId;
  req.userRole = userRole;
  next();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const appErr = err as Partial<AppError>;
  if (appErr && typeof appErr.code === 'string') {
    return res.status(appErr.httpStatus || 400).json({ error: appErr.code, message: appErr.message });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected server error' });
}
