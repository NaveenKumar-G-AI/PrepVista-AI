import { NextFunction, Request, Response } from 'express';

export interface AuthenticatedRequest extends Request {
  auth?: { studentId: string; tenantId?: string; roles?: string[] };
}

/**
 * PLACEHOLDER authentication. This engine deliberately does NOT implement
 * its own auth system (spec section 4: "do not create duplicate
 * authentication"). Replace the body of this function with a call into
 * your existing ACEAPT auth middleware (the one already protecting your
 * other assessment routes) and populate `req.auth` from it.
 *
 * The header-based check below is for local `npm run dev` only and must
 * not be shipped as-is.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const headerStudentId = req.header('x-student-id'); // DEV-ONLY placeholder
  if (!headerStudentId) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Wire this middleware to your existing ACEAPT auth system.' });
    return;
  }
  req.auth = { studentId: headerStudentId, tenantId: req.header('x-tenant-id') ?? undefined };
  next();
}
