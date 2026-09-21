import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { AuthContext, Role } from '../../types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && Object.values(Role).includes(value as Role);
}

/**
 * Verifies a bearer JWT issued by CodeForge's real identity provider and
 * populates req.auth. This gateway does not issue tokens, only verifies
 * them — wire JWT_SECRET (and JWT_ISSUER, if you want issuer pinning) to
 * the same signing secret CodeForge's own auth already uses, so this
 * layer authenticates against the SAME identity, not a parallel one (see
 * spec: "Use the existing product authorization/configuration model").
 *
 * DEV-ONLY FALLBACK: with no JWT_SECRET configured AND NODE_ENV !==
 * "production", requests may instead supply identity via the
 * `x-dev-auth` header as JSON: {"userId":"u1","organizationId":"org1","role":"ORG_ADMIN"}.
 * This exists so the gateway and dashboard are runnable out of the box
 * without a real identity provider wired up yet. It is structurally
 * impossible for this fallback to activate in production: it requires
 * NODE_ENV !== "production" in addition to a blank secret, and it logs a
 * loud warning on every use.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization');

  if (header?.startsWith('Bearer ')) {
    if (!config.auth.jwtSecret) {
      res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET is not set' });
      return;
    }
    try {
      const token = header.slice('Bearer '.length);
      const payload = jwt.verify(token, config.auth.jwtSecret, config.auth.jwtIssuer ? { issuer: config.auth.jwtIssuer } : undefined) as Record<string, unknown>;
      const { sub, organizationId, role } = payload;
      if (typeof sub !== 'string' || typeof organizationId !== 'string' || !isRole(role)) {
        res.status(401).json({ error: 'Token is missing required claims (sub, organizationId, role)' });
        return;
      }
      req.auth = { userId: sub, organizationId, role };
      next();
      return;
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
  }

  if (!config.auth.jwtSecret && config.nodeEnv !== 'production') {
    const devHeader = req.header('x-dev-auth');
    if (devHeader) {
      try {
        const parsed = JSON.parse(devHeader);
        if (typeof parsed.userId === 'string' && typeof parsed.organizationId === 'string' && isRole(parsed.role)) {
          // eslint-disable-next-line no-console
          console.warn('[auth] Using x-dev-auth fallback — this MUST NOT happen in production. Set JWT_SECRET to disable this path.');
          req.auth = { userId: parsed.userId, organizationId: parsed.organizationId, role: parsed.role };
          next();
          return;
        }
      } catch {
        // fall through to 401 below
      }
    }
  }

  res.status(401).json({ error: 'Missing or invalid Authorization header' });
}

export function requireRole(allowed: ReadonlySet<Role>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!allowed.has(req.auth.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action' });
      return;
    }
    next();
  };
}
