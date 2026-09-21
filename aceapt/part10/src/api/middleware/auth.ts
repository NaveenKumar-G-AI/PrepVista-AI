import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      studentId?: string;
    }
  }
}

/**
 * NOT PRODUCTION AUTH - SS52 Security.
 *
 * This placeholder trusts an `x-student-id` header so the demo routes
 * are runnable end to end. It MUST be replaced before this touches real
 * traffic: verify the caller's session/JWT/whatever ACEAPT already uses,
 * then set req.studentId from the VERIFIED identity - never from a
 * client-supplied header, or any student could read or trigger a
 * recompute for any other student's forecast.
 *
 * See README "Security checklist before production".
 */
export function requireAuthenticatedStudent(req: Request, res: Response, next: NextFunction) {
  const studentId = req.header('x-student-id');
  if (!studentId) {
    return res.status(401).json({ error: 'Missing authenticated student context. Wire this middleware to real auth.' });
  }
  req.studentId = studentId;
  next();
}
