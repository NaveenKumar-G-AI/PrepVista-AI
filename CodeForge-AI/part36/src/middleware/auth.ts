import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/errors';
import type { AuthContext } from '../domain/types';
import { Role } from '../domain/enums';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

interface TokenClaims {
  sub: string;
  organizationId: string;
  role: string;
}

/**
 * Section 52: Authenticated User -> Organization -> Permission ->
 * Cohort Access -> Requested Data. This middleware only handles the
 * first hop. In production this should validate against CodeForge's
 * real identity service instead of decoding a locally-signed JWT —
 * add an IdentityPort-shaped adapter (see src/integrations/ports.ts
 * for the pattern) and call it here instead of jwt.verify.
 */
export function auth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token.');
  }
  const token = header.slice('Bearer '.length);

  if (!env.JWT_SECRET) {
    throw new UnauthorizedError('Server auth is not configured (JWT_SECRET is empty).');
  }

  try {
    const claims = jwt.verify(token, env.JWT_SECRET, { issuer: env.JWT_ISSUER }) as unknown as TokenClaims;
    if (!Object.values(Role).includes(claims.role as Role)) {
      throw new UnauthorizedError('Token has an unrecognized role.');
    }
    req.auth = { userId: claims.sub, organizationId: claims.organizationId, role: claims.role as Role };
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token.');
  }
}
