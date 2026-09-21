import { NextFunction, Request, Response } from 'express';
import { DEMO_STUDENT_ID } from '../db/seed';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      studentId: string;
    }
  }
}

/**
 * STUB AUTH - section 44/45 says to "use existing authentication and RBAC",
 * but no existing auth system was provided alongside this spec. This reads
 * an X-Student-Id header (falling back to a demo student so the API is
 * usable out of the box) and nothing else - there is NO signature
 * verification, NO session, NO password.
 *
 * This must be replaced with real authentication (JWT/session, validated
 * against the existing ACEAPT identity system) before this is anything more
 * than a local prototype. Every other layer of the app is written against
 * `req.studentId` only, so swapping this one file is the entire migration -
 * no other file needs to change.
 */
export function stubAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('X-Student-Id');
  req.studentId = header && header.trim().length > 0 ? header.trim() : DEMO_STUDENT_ID;
  next();
}
