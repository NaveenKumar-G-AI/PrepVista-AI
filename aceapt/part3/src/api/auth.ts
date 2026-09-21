import type { NextFunction, Request, Response } from 'express';

// DEMO ONLY: this middleware stands in for whatever already verifies a
// session/JWT in Feature 1 and Feature 2. In the real ACEAPT codebase, swap
// this for that real auth middleware — student identity must never be
// trusted from a client-supplied header or request body, only from a
// verified server-side session.

declare module 'express-serve-static-core' {
  interface Request {
    sessionStudentId?: string;
  }
}

export function demoSessionAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionStudentId = req.header('x-student-id');
  if (!sessionStudentId) {
    res.status(401).json({ error: 'unauthenticated', message: 'Missing x-student-id (demo stand-in for a real session).' });
    return;
  }
  req.sessionStudentId = sessionStudentId;
  next();
}

export function requireOwnStudentId(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requested = req.params[paramName];
    if (requested !== req.sessionStudentId) {
      res.status(403).json({ error: 'forbidden', message: "Cannot access another student's data." });
      return;
    }
    next();
  };
}
