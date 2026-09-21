import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ActorRole } from '../../db/pool';

/**
 * This is deliberately NOT a full authentication system (spec §6/§9/§40:
 * "do not create duplicate systems"). It verifies an HMAC-signed token —
 * swap verifyHmacJwt for a call into whatever the real ACEAPT auth service
 * issues (a proper JWKS-verified JWT, a session lookup, etc.) and nothing
 * downstream of req.studentId/req.actorRole needs to change.
 *
 * signHmacJwt is exported alongside it purely so local dev/tests can mint
 * a token without a real auth service running — it is not meant to be how
 * production issues tokens.
 */

export interface AuthedRequest extends Request {
  studentId?: string;
  actorRole?: ActorRole;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function signHmacJwt(payload: Record<string, unknown>, secret: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${signature}`;
}

function verifyHmacJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const expectedSig = crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
  const providedSig = base64UrlDecode(signatureB64);
  if (expectedSig.length !== providedSig.length || !crypto.timingSafeEqual(expectedSig, providedSig)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

const VALID_ROLES: ActorRole[] = ['student', 'tpo', 'trainer', 'service'];

/**
 * Verifies the bearer token and attaches req.studentId / req.actorRole.
 *
 * If ALIGN_SERVICE_JWT_SECRET is not set, this FAILS CLOSED (503) rather
 * than letting every request through — an unconfigured secret must never
 * silently mean "no auth check". Since keys/secrets were deliberately left
 * blank for you to fill in, this is the state the module starts in until
 * you set one.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }

  const secret = process.env.ALIGN_SERVICE_JWT_SECRET;
  if (!secret) {
    res.status(503).json({
      error:
        'ALIGN_SERVICE_JWT_SECRET is not configured. Wire this to the token your real ACEAPT auth issues — see docs/INTEGRATION.md.',
    });
    return;
  }

  const payload = verifyHmacJwt(header.slice('Bearer '.length), secret);
  if (!payload || typeof payload.sub !== 'string') {
    res.status(401).json({ error: 'invalid or expired token' });
    return;
  }

  const role = VALID_ROLES.includes(payload.role as ActorRole) ? (payload.role as ActorRole) : 'student';
  req.studentId = payload.sub;
  req.actorRole = role;
  next();
}

export function requireRole(...roles: ActorRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.actorRole || !roles.includes(req.actorRole)) {
      res.status(403).json({ error: `requires one of: ${roles.join(', ')}` });
      return;
    }
    next();
  };
}

/** For a :studentId-scoped route, students may only ever read their own data. */
export function requireSelfOrElevated(req: AuthedRequest, res: Response, next: NextFunction): void {
  const requestedStudentId = req.params.studentId;
  if (req.actorRole === 'student' && requestedStudentId && requestedStudentId !== req.studentId) {
    res.status(403).json({ error: 'students may only access their own alignment data' });
    return;
  }
  next();
}
