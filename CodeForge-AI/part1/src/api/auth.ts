import type { NextFunction, Request, Response } from 'express';
import type { CareerContextRepo } from '../repositories/careerContextRepo.js';
import { UnauthenticatedError } from './errors.js';

// -----------------------------------------------------------------------
// NOT PRODUCTION AUTH. Trusts an `x-student-id` header naming an already-
// authenticated student. A real deployment replaces this single function
// with verification of a session/JWT and nothing else in this module
// needs to change — every route reads identity from req.auth, never from
// the request body or query string.
// -----------------------------------------------------------------------

export interface AuthContext {
  studentId: string;
  institutionId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function createAuthMiddleware(contextRepo: CareerContextRepo) {
  return function mockAuth(req: Request, _res: Response, next: NextFunction): void {
    const studentId = req.header('x-student-id');
    if (!studentId) return next(new UnauthenticatedError());
    const student = contextRepo.getStudentById(studentId);
    if (!student) return next(new UnauthenticatedError());
    req.auth = { studentId: student.id, institutionId: student.institutionId };
    next();
  };
}
