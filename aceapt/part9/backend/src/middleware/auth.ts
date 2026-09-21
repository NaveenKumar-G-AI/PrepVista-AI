import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

// ============================================================
// AUTH MIDDLEWARE  (spec section 50)
// ============================================================
// Placeholder JWT auth so the API is independently runnable/testable.
// In production, either:
//   (a) set a real JWT_SECRET and have your existing ACEAPT login
//       issue tokens with a `studentId` claim, or
//   (b) delete this file and mount buildRouter() (src/api/routes.ts)
//       behind your existing ACEAPT auth middleware, which should
//       populate req.studentId the same way.
// Every route handler in routes.ts trusts req.studentId completely -
// it is the single choke point for "who is making this request".

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      studentId?: string;
    }
  }
}

function jwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Missing bearer token.' });
    return;
  }
  try {
    const token = header.slice('Bearer '.length);
    const payload = jwt.verify(token, jwtSecret()) as { studentId?: string };
    if (!payload.studentId) {
      res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Token is missing a studentId claim.' });
      return;
    }
    req.studentId = payload.studentId;
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Invalid or expired token.' });
  }
}

/** Dev-only convenience: mints a token for local testing and the demo UI. */
export function issueDevToken(studentId: string): string {
  return jwt.sign({ studentId }, jwtSecret(), { expiresIn: '12h' });
}
