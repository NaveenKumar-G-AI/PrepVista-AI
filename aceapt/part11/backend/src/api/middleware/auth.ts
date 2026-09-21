import { Request, Response, NextFunction } from 'express';

/**
 * Placeholder authorization (section 34: privacy/role-based access). NOT
 * production auth - JWT_SECRET is left blank in .env.example on purpose.
 *
 * Current behavior: requires an `x-student-id` header and only lets a
 * request through if it matches the :id route param, so at minimum one
 * student can never read another student's behavior data by guessing an
 * id. `x-role: admin` bypasses this for the internal dashboard use case
 * (section 40). Replace this whole function with real session/JWT
 * verification once JWT_SECRET is set - nothing else needs to change,
 * every route already goes through this one middleware.
 */
export function requireStudentAccess(req: Request, res: Response, next: NextFunction): void {
  const requestedId = req.params.id as string;
  const callerId = req.header('x-student-id');
  const role = req.header('x-role');

  if (role === 'admin') { next(); return; }
  if (!callerId) {
    res.status(401).json({ error: 'Missing x-student-id header (placeholder auth - see api/middleware/auth.ts).' });
    return;
  }
  if (callerId !== requestedId) {
    res.status(403).json({ error: "Cannot access another student's behavior data." });
    return;
  }
  next();
}
