import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';

export interface AuthedRequest extends Request {
  auth?: { studentId: string; roles: string[] };
}

/** Verifies a bearer token issued by the EXISTING ACEAPT auth system - this
 * middleware only verifies, it does not issue tokens (spec 5: "authorization"
 * is something to inspect/reuse, not rebuild). Configure JWT_SECRET to
 * match that issuer's signing key/secret. */
export function authMiddleware(secretOrPublicKey: string): RequestHandler {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing bearer token.' });
      return;
    }
    try {
      const token = header.slice('Bearer '.length);
      const payload = jwt.verify(token, secretOrPublicKey) as { sub?: string; studentId?: string; roles?: string[] };
      const studentId = payload.studentId ?? payload.sub;
      if (!studentId) throw new Error('Token missing studentId.');
      req.auth = { studentId, roles: payload.roles ?? [] };
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token.' });
    }
  };
}

export function requireRole(...roles: string[]): RequestHandler {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const authedReq = req as AuthedRequest;
    if (!authedReq.auth || !roles.some((r) => authedReq.auth!.roles.includes(r))) {
      res.status(403).json({ error: 'Insufficient role for this endpoint.' });
      return;
    }
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ValidationError || err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request.', details: err instanceof ZodError ? err.issues : undefined });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
}
